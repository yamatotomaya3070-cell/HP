// トライアル終了通知の実行（3日前/前日/当日）。日次バッチ（Cron）から呼ぶ想定。
// - active なトライアルを走査し、暦日差からマイルストーンを判定
// - 配信停止・メール未登録はスキップ
// - TrialReminder(trialId, milestone) の unique 制約で二重送信を防止（冪等）
// - 予約→送信→失敗時は予約を取り消し（次回再試行）
// 実送信は MailProvider 抽象化に委譲（実プロバイダ確定前は DevMailProvider）。

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db.js";
import { type MailProvider } from "@/server/mail/provider.js";
import { buildReplyTo } from "@/server/mail/replyAddress.js";
import { MONTHLY_FEE } from "./lifecycle.js";
import { composeTrialReminder, type TrialMilestone } from "./composeTrial.js";

export type ReminderReason =
  | "sent"
  | "already_sent"
  | "no_email"
  | "suppressed"
  | "not_in_window"
  | "send_failed";

export interface ReminderOutcome {
  facilityId: string;
  facilityName: string;
  milestone: TrialMilestone | null;
  sent: boolean;
  reason: ReminderReason;
}

/** 2つの日時の「暦日」差（時刻を無視）。to が未来なら正。 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** 残り暦日数からマイルストーンを決める。対象外は null。 */
export function milestoneForDaysRemaining(days: number): TrialMilestone | null {
  if (days === 3) return "d3";
  if (days === 1) return "d1";
  if (days === 0) return "d0";
  return null;
}

export interface RunTrialRemindersOptions {
  provider: MailProvider;
  /** 判定基準時刻（テスト用に注入可能）。 */
  now?: Date;
  baseUrl?: string;
  /** 解約・支払い管理URL（Stripe確定後に注入）。 */
  manageUrlFor?: (facilityId: string) => string | undefined;
}

/** トライアル終了通知を1回実行する。送信結果の一覧を返す。 */
export async function runTrialReminders(
  opts: RunTrialRemindersOptions,
): Promise<ReminderOutcome[]> {
  const now = opts.now ?? new Date();
  const baseUrl = opts.baseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

  const trials = await prisma.trial.findMany({
    where: { state: "active" },
    include: {
      facility: {
        include: {
          subscription: true,
          sites: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });

  const outcomes: ReminderOutcome[] = [];

  for (const trial of trials) {
    const facility = trial.facility;
    const base = {
      facilityId: facility.id,
      facilityName: facility.name,
    };

    // トライアル中の契約のみ対象（解約・課金移行後は通知しない）。
    if (facility.subscription && facility.subscription.state !== "trialing") {
      outcomes.push({ ...base, milestone: null, sent: false, reason: "not_in_window" });
      continue;
    }

    const days = calendarDaysBetween(now, trial.endsAt);
    const milestone = milestoneForDaysRemaining(days);
    if (!milestone) {
      outcomes.push({ ...base, milestone: null, sent: false, reason: "not_in_window" });
      continue;
    }

    if (!facility.email) {
      outcomes.push({ ...base, milestone, sent: false, reason: "no_email" });
      continue;
    }

    const suppressed = await prisma.suppressionList.findUnique({
      where: { email: facility.email },
    });
    if (suppressed) {
      outcomes.push({ ...base, milestone, sent: false, reason: "suppressed" });
      continue;
    }

    // 送信済みなら冪等スキップ。事前チェックでログを汚さず、稀な競合は unique 制約で最終防御。
    const already = await prisma.trialReminder.findUnique({
      where: { trialId_milestone: { trialId: trial.id, milestone } },
    });
    if (already) {
      outcomes.push({ ...base, milestone, sent: false, reason: "already_sent" });
      continue;
    }

    // 予約（冪等キー）。競合時は P2002 → already_sent。
    let reservationId: string;
    try {
      const created = await prisma.trialReminder.create({
        data: { trialId: trial.id, facilityId: facility.id, milestone },
      });
      reservationId = created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        outcomes.push({ ...base, milestone, sent: false, reason: "already_sent" });
        continue;
      }
      throw err;
    }

    const slug = facility.sites[0]?.slug;
    const { subject, text } = composeTrialReminder(milestone, {
      facilityName: facility.name,
      endsAt: trial.endsAt,
      monthlyFee: MONTHLY_FEE,
      previewUrl: slug ? `${baseUrl}/preview/${slug}` : undefined,
      manageUrl: opts.manageUrlFor?.(facility.id),
    });

    try {
      await opts.provider.send({
        to: facility.email,
        replyTo: buildReplyTo(facility.id),
        subject,
        text,
      });
      outcomes.push({ ...base, milestone, sent: true, reason: "sent" });
    } catch {
      // 送信失敗は予約を取り消して次回再試行できるようにする。
      await prisma.trialReminder.delete({ where: { id: reservationId } }).catch(() => {});
      outcomes.push({ ...base, milestone, sent: false, reason: "send_failed" });
    }
  }

  return outcomes;
}
