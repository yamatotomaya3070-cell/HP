// 公開前確認のDB記録（仕様 Phase6）。純粋な定義（Zod・ラベル・レビュー整形）は
// src/lib/prePublish.ts にあり、ここでは記録と状態確認のみを担う。

import { prisma } from "@/lib/db.js";
import { type PrePublishConfirm } from "@/lib/prePublish.js";

export {
  PRE_PUBLISH_ITEMS,
  prePublishConfirmSchema,
  buildPublishReview,
  type PrePublishConfirm,
  type PrePublishKey,
  type ReviewRow,
} from "@/lib/prePublish.js";

export interface RecordResult {
  ok: boolean;
  alreadyPublished?: boolean;
}

/**
 * 公開前確認を記録する（冪等）。既に published/static のサイトには不要。
 * 実際の公開は 5,000円決済成功時（lifecycle）に行う。ここは人手確認の記録のみ。
 */
export async function recordPrePublishConfirm(
  facilityId: string,
  confirm: PrePublishConfirm,
): Promise<RecordResult> {
  const site = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
  });
  if (!site) throw new Error("公開対象のサイトが見つかりません");
  if (site.publishState === "published" || site.publishState === "static") {
    return { ok: true, alreadyPublished: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.generatedSite.update({
      where: { id: site.id },
      data: { prePublishConfirm: confirm, prePublishConfirmedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        facilityId,
        action: "site.pre_publish_confirmed",
        actor: "facility",
        after: confirm,
      },
    });
  });
  return { ok: true };
}

/** 事業所が公開前確認を完了しているか（決済導線の前提チェックに使う）。 */
export async function isPrePublishConfirmed(facilityId: string): Promise<boolean> {
  const site = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
    select: { prePublishConfirmedAt: true },
  });
  return !!site?.prePublishConfirmedAt;
}
