// 課金・公開の状態機械（仕様 Phase5-6）。
// - 14日トライアル（終了日計算）
// - 5,000円決済成功時のみ公開（それ以前は非公開）
// - 解約後も静的公開継続（公開は残す・AI編集のみ停止）
// - 再契約で再開
// - 決済Webhook は stripeEventId で冪等（二重課金防止）

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db.js";
import { type PaymentEvent } from "./provider.js";

// 料金体系（2026-09 改定）: 無料¥0 / 通常¥5,000 / 上級¥7,000。公開は月額に含む。
export const TRIAL_DAYS = 7;
export const MONTHLY_FEE = 5000; // 円（通常プラン月額・編集し放題＋公開）
export const MONTHLY_FEE_PRO = 7000; // 円（上級プラン月額・プロに相談できる）
export const PRO_EDIT_FEE = 10000; // 円（プロ編集の都度依頼。上級プランは8,000円）
export const PRO_EDIT_FEE_PRO_PLAN = 8000;
/** @deprecated 公開は月額に含むため廃止。過去の Payment レコード互換のために残す。 */
export const PUBLISH_FEE = 5000;

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}
function addMonth(base: Date): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * 決済を冪等に1回だけ記録する。既に同 eventId があれば true（重複）を返す。
 * 事前チェックでログを汚さず、稀な競合は unique 制約で最終防御。
 */
async function recordPaymentOnce(
  facilityId: string,
  kind: "publish_5000" | "subscription",
  amount: number,
  state: "succeeded" | "failed",
  eventId: string,
): Promise<boolean> {
  const existing = await prisma.payment.findUnique({ where: { stripeEventId: eventId } });
  if (existing) return true;
  try {
    await prisma.payment.create({
      data: { facilityId, kind, amount, state, stripeEventId: eventId },
    });
    return false;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return true; // 競合で同時挿入された
    }
    throw err;
  }
}

/** その事業所の（最初の）サイトを取得。 */
async function siteOf(facilityId: string) {
  return prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
  });
}

export interface EventOutcome {
  applied: boolean;
  duplicate?: boolean;
  note: string;
}

/** カード登録＋14日トライアル開始。終了日＝開始+14日。冪等（subscription upsert）。 */
async function onTrialStarted(e: Extract<PaymentEvent, { type: "trial_started" }>): Promise<EventOutcome> {
  const now = new Date();
  const endsAt = addDays(now, TRIAL_DAYS);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { facilityId: e.facilityId },
      create: {
        facilityId: e.facilityId,
        stripeCustomerId: e.customerId,
        stripeSubscriptionId: e.subscriptionId,
        state: "trialing",
        plan: e.plan,
        nextBillingAt: endsAt,
      },
      update: {
        stripeCustomerId: e.customerId,
        stripeSubscriptionId: e.subscriptionId,
        state: "trialing",
        plan: e.plan,
        nextBillingAt: endsAt,
        canceledAt: null,
      },
    });
    await tx.trial.create({
      data: { facilityId: e.facilityId, startedAt: now, endsAt, state: "active" },
    });
    await tx.facility.update({ where: { id: e.facilityId }, data: { status: "trialing" } });
    await tx.leadEvent.create({
      data: { facilityId: e.facilityId, type: "card_registered", meta: { endsAt, plan: e.plan } },
    });
  });
  return { applied: true, note: `トライアル開始（終了日 ${endsAt.toISOString().slice(0, 10)}）` };
}

/** 決済成功。publish_5000 のときのみ公開へ。冪等（Payment.stripeEventId unique）。 */
async function onPaymentSucceeded(e: Extract<PaymentEvent, { type: "payment_succeeded" }>): Promise<EventOutcome> {
  const dup = await recordPaymentOnce(e.facilityId, e.kind, e.amount, "succeeded", e.eventId);
  if (dup) return { applied: false, duplicate: true, note: "重複イベント（二重課金を防止しスキップ）" };

  if (e.kind === "publish_5000") {
    const site = await siteOf(e.facilityId);
    await prisma.$transaction(async (tx) => {
      if (site) {
        await tx.generatedSite.update({
          where: { id: site.id },
          data: { publishState: "published", publishedAt: new Date() },
        });
      }
      await tx.facility.update({ where: { id: e.facilityId }, data: { status: "published" } });
      await tx.leadEvent.create({ data: { facilityId: e.facilityId, type: "published" } });
    });
    return { applied: true, note: "5,000円決済成功 → 正式公開" };
  }

  // 月額決済成功: 契約継続、次回請求日を更新、トライアルは converted に。
  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { facilityId: e.facilityId },
      data: { state: "active", nextBillingAt: addMonth(new Date()) },
    });
    await tx.trial.updateMany({
      where: { facilityId: e.facilityId, state: "active" },
      data: { state: "converted" },
    });
    await tx.facility.update({ where: { id: e.facilityId }, data: { status: "subscribed" } });
    await tx.leadEvent.create({ data: { facilityId: e.facilityId, type: "subscribed" } });
  });
  return { applied: true, note: "月額決済成功 → 契約中" };
}

/** 決済失敗。記録のみ（公開・課金状態は変えない）。冪等。 */
async function onPaymentFailed(e: Extract<PaymentEvent, { type: "payment_failed" }>): Promise<EventOutcome> {
  const dup = await recordPaymentOnce(e.facilityId, e.kind, e.amount, "failed", e.eventId);
  if (dup) return { applied: false, duplicate: true, note: "重複イベント" };
  await prisma.subscription.updateMany({
    where: { facilityId: e.facilityId },
    data: { state: "past_due" },
  });
  return { applied: true, note: "決済失敗を記録" };
}

/** 解約。公開は静的として継続（AI編集のみ停止）。以後課金しない。 */
async function onCanceled(e: Extract<PaymentEvent, { type: "subscription_canceled" }>): Promise<EventOutcome> {
  const site = await siteOf(e.facilityId);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { facilityId: e.facilityId },
      data: { state: "canceled", canceledAt: new Date(), nextBillingAt: null },
    });
    // 公開済みなら static（公開継続・AI編集停止）へ。未公開なら変えない。
    if (site && site.publishState === "published") {
      await tx.generatedSite.update({ where: { id: site.id }, data: { publishState: "static" } });
    }
    await tx.facility.update({ where: { id: e.facilityId }, data: { status: "canceled" } });
    await tx.leadEvent.create({ data: { facilityId: e.facilityId, type: "canceled" } });
  });
  return { applied: true, note: "解約 → 静的公開継続・AI編集停止" };
}

/** 再契約。static を公開に戻し、契約を再開。 */
async function onResumed(e: Extract<PaymentEvent, { type: "subscription_resumed" }>): Promise<EventOutcome> {
  const site = await siteOf(e.facilityId);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { facilityId: e.facilityId },
      data: { state: "active", canceledAt: null, stripeSubscriptionId: e.subscriptionId, nextBillingAt: addMonth(new Date()) },
    });
    if (site && site.publishState === "static") {
      await tx.generatedSite.update({ where: { id: site.id }, data: { publishState: "published" } });
    }
    await tx.facility.update({ where: { id: e.facilityId }, data: { status: "resubscribed" } });
    await tx.leadEvent.create({ data: { facilityId: e.facilityId, type: "resubscribed" } });
  });
  return { applied: true, note: "再契約 → 公開・AI編集を再開" };
}

/** Webhook イベント1件を処理する（冪等）。 */
export async function processPaymentEvent(e: PaymentEvent): Promise<EventOutcome> {
  switch (e.type) {
    case "trial_started":
      return onTrialStarted(e);
    case "payment_succeeded":
      return onPaymentSucceeded(e);
    case "payment_failed":
      return onPaymentFailed(e);
    case "subscription_canceled":
      return onCanceled(e);
    case "subscription_resumed":
      return onResumed(e);
  }
}

/** 解約後(static)は AI編集不可（仕様: 解約後AI編集停止）。 */
export async function isAiEditable(facilityId: string): Promise<boolean> {
  const site = await siteOf(facilityId);
  return !!site && site.publishState !== "static";
}
