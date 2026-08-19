// 初回営業メールの一斉配信（Phase 3 送信側）。
// 原則: 個別送信のみ（CC/BCC禁止）・事業所別 Reply-To（返信で編集ループへ）・配信停止リンク必須。
// 段階配信（limit 上限で 300→1,000→県単位）・テスト送信・配信停止/未登録/HP未生成/送信済みは送らない。
// 送信は MailProvider 抽象化に委譲（実プロバイダ確定前は DevMailProvider）。DB 記録は事業所ごとに原子的に行う。

import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db.js";
import { type MailProvider, type OutboundAttachment } from "./provider.js";
import { buildReplyTo } from "./replyAddress.js";
import { buildUnsubscribeUrl } from "./unsubscribe.js";
import { composeSalesEmail, type SalesSender } from "./composeSales.js";

/** スクリーンショットがあれば添付に変換する。読めない場合は添付なし（送信は止めない）。 */
async function screenshotAttachment(
  path: string | null,
  facilityName: string,
): Promise<OutboundAttachment[] | undefined> {
  if (!path) return undefined;
  try {
    const buf = await readFile(path);
    return [
      {
        filename: `${facilityName}_サンプルHP.png`,
        contentBase64: buf.toString("base64"),
        contentType: "image/png",
      },
    ];
  } catch {
    return undefined;
  }
}

export type CampaignSkip = "no_email" | "no_site" | "suppressed";
export type CampaignOutcome = "sent" | "send_failed" | CampaignSkip;

export interface CampaignResultItem {
  facilityId: string;
  facilityName: string;
  outcome: CampaignOutcome;
}

export interface RunCampaignOptions {
  provider: MailProvider;
  /** キャンペーン名（記録用）。 */
  name: string;
  /** 対象都道府県（未指定なら全国）。 */
  prefecture?: string;
  /** 送信上限（段階配信）。 */
  limit: number;
  /** テスト送信先。指定時はこの宛先にのみ送り、実データ（状態・スレッド・ログ）は更新しない。 */
  testTo?: string;
  sender: SalesSender;
  baseUrl?: string;
}

export interface RunCampaignReport {
  campaignId?: string;
  results: CampaignResultItem[];
  sent: number;
}

/**
 * 営業メールを1回配信する。対象は「HP生成済み（site_generated）」でメール有り・配信停止でない事業所。
 * 送信のたびに Facility.status を email_sent へ進め、EmailThread(outbound)・LeadEvent(email_sent) を記録する。
 */
export async function runCampaign(opts: RunCampaignOptions): Promise<RunCampaignReport> {
  const baseUrl = opts.baseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  const isTest = Boolean(opts.testTo);

  // 対象抽出: 未送信（site_generated）でメール有り。段階配信のため limit で絞る。
  const facilities = await prisma.facility.findMany({
    where: {
      status: "site_generated",
      email: { not: null },
      ...(opts.prefecture ? { prefecture: opts.prefecture } : {}),
    },
    include: { sites: { orderBy: { createdAt: "asc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
    take: opts.limit,
  });

  // テスト送信は実データを汚さないため、キャンペーン記録を作らない。
  const campaign = isTest
    ? null
    : await prisma.emailCampaign.create({
        data: { name: opts.name, prefecture: opts.prefecture, isTest: false },
      });

  const results: CampaignResultItem[] = [];
  let sent = 0;

  for (const facility of facilities) {
    const base = { facilityId: facility.id, facilityName: facility.name };

    if (!facility.email) {
      results.push({ ...base, outcome: "no_email" });
      continue;
    }
    const slug = facility.sites[0]?.slug;
    if (!slug) {
      results.push({ ...base, outcome: "no_site" });
      continue;
    }

    // 配信停止・受信拒否は横断で送らない。
    const suppressed = await prisma.suppressionList.findUnique({
      where: { email: facility.email },
    });
    if (suppressed) {
      results.push({ ...base, outcome: "suppressed" });
      continue;
    }

    const { subject, text } = composeSalesEmail({
      facilityName: facility.name,
      previewUrl: `${baseUrl}/preview/${slug}`,
      unsubscribeUrl: buildUnsubscribeUrl(facility.id, baseUrl),
      sender: opts.sender,
    });

    const attachments = await screenshotAttachment(facility.sites[0]?.screenshotPath ?? null, facility.name);

    try {
      await opts.provider.send({
        to: opts.testTo ?? facility.email,
        replyTo: buildReplyTo(facility.id),
        subject,
        text,
        attachments,
      });
    } catch {
      results.push({ ...base, outcome: "send_failed" });
      continue;
    }

    sent += 1;
    results.push({ ...base, outcome: "sent" });

    if (isTest || !campaign) continue;

    // 本番送信のみ記録（テストは実データを汚さない）。
    await prisma.$transaction([
      prisma.emailThread.create({
        data: {
          facilityId: facility.id,
          replyToken: `camp-${campaign.id}-${facility.id}`,
          direction: "outbound",
          subject,
          body: text,
          campaignId: campaign.id,
        },
      }),
      prisma.leadEvent.create({
        data: { facilityId: facility.id, type: "email_sent", meta: { campaignId: campaign.id } },
      }),
      prisma.facility.update({
        where: { id: facility.id },
        data: { status: "email_sent" },
      }),
      prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { sentCount: { increment: 1 } },
      }),
    ]);
  }

  return { campaignId: campaign?.id, results, sent };
}
