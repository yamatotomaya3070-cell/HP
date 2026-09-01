// 「この事業所は今なにができるか」を一箇所で決める（料金プランの実体）。
//
// 料金体系:
//   梅 ¥0        … HP生成・閲覧 ＋ AI編集は3回まで（魔法の証明）／公開は不可
//   竹 ¥5,000/月 … AI編集 無制限 ＋ HP公開          （7日間の無料トライアル付き）
//   松 ¥7,000/月 … 上記 ＋ プロに相談できる
//
// なぜここに集約するか: これまで編集の可否は runEdit 内の「解約後(static)か」だけで判定して
// おり、未契約でも無制限に編集できてしまっていた（料金表があっても意味が無い状態）。
// 判定を純粋関数に切り出し、DB参照と分離してテスト可能にする。

import { prisma } from "@/lib/db.js";

/** 無料プランで適用できる編集回数。失敗した編集は数えない（こちらの都合で枠を消費させない）。 */
export const MAX_FREE_EDITS = 3;

export type Plan = "free" | "trialing" | "active" | "past_due" | "canceled";

export interface EntitlementInput {
  /** 契約状態。未契約なら null。 */
  subscriptionState: "trialing" | "active" | "past_due" | "canceled" | null;
  /** サイトの公開状態。static は解約後の静的公開。 */
  publishState: "draft" | "preview" | "published" | "static" | null;
  /** これまでに「適用された」編集の回数（全チャネル合算）。 */
  appliedEditCount: number;
}

export interface Entitlement {
  plan: Plan;
  canEdit: boolean;
  canPublish: boolean;
  /** 無料プランのみ: あと何回編集できるか。 */
  remainingFreeEdits?: number;
  /** 編集できない理由。文言の出し分けに使う。 */
  blockedReason?: "free_limit" | "canceled";
}

/** 契約状態・公開状態・編集回数から、できることを決める（純粋関数）。 */
export function decideEntitlement(input: EntitlementInput): Entitlement {
  const { subscriptionState, publishState, appliedEditCount } = input;

  // 解約後は編集停止（公開は継続）。無料枠には戻さない＝解約→無料3回の往復を防ぐ。
  if (subscriptionState === "canceled" || publishState === "static") {
    return {
      plan: "canceled",
      canEdit: false,
      canPublish: false,
      blockedReason: "canceled",
    };
  }

  // トライアル・契約中（支払い失敗中も猶予として止めない）は無制限。
  if (
    subscriptionState === "trialing" ||
    subscriptionState === "active" ||
    subscriptionState === "past_due"
  ) {
    return { plan: subscriptionState, canEdit: true, canPublish: true };
  }

  // 未契約＝無料プラン。
  const remaining = Math.max(0, MAX_FREE_EDITS - appliedEditCount);
  return {
    plan: "free",
    canEdit: remaining > 0,
    canPublish: false,
    remainingFreeEdits: remaining,
    ...(remaining === 0 ? { blockedReason: "free_limit" as const } : {}),
  };
}

/** DBから現在の状態を集めて、できることを返す。 */
export async function getEntitlement(facilityId: string): Promise<Entitlement> {
  const [subscription, site, appliedEditCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { facilityId },
      select: { state: true },
    }),
    prisma.generatedSite.findFirst({
      where: { facilityId },
      orderBy: { createdAt: "asc" },
      select: { publishState: true },
    }),
    // 失敗・却下は数えない。適用できた編集だけを消費とみなす。
    prisma.editRequest.count({ where: { facilityId, status: "applied" } }),
  ]);

  return decideEntitlement({
    subscriptionState: subscription?.state ?? null,
    publishState: site?.publishState ?? null,
    appliedEditCount,
  });
}
