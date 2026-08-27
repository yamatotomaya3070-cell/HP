// AI編集オーケストレーション（Phase 3 の核）。
// 現在バージョン読込 → モデルが操作提案 → ホワイトリスト適用 → 新バージョン作成 → 履歴/監査。
// モデルは注入(EditModel)。テストや無APIキー時はダミー実装を渡せる。

import { prisma } from "@/lib/db.js";
import { siteDataSchema } from "@/lib/siteData.js";
import { applyOps } from "./applyOps.js";
import { resolveImageOps } from "./resolveImageOps.js";
import { type EditModel } from "./editModel.js";

export type EditChannel = "email" | "editor";

export interface RunEditInput {
  facilityId: string;
  instruction: string;
  channel: EditChannel;
  /** 監査ログの実行者（admin id / "facility" / "system"）。 */
  actor?: string;
}

export interface RunEditResult {
  applied: boolean;
  appliedCount: number;
  rejected: { index: number; reason: string }[];
  /** 事業所向けの説明文（モデル生成）。 */
  message: string;
  slug: string;
  siteId: string;
  /** 変更が適用された場合の新バージョンID（無変更なら現行のまま）。 */
  versionId: string;
}

/** 事業所の現行サイトと有効バージョンを取得する。 */
async function loadCurrent(facilityId: string) {
  const site = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
    include: { currentVersion: true },
  });
  if (!site || !site.currentVersion) {
    throw new Error(`生成済みサイトがありません: ${facilityId}`);
  }
  const parsed = siteDataSchema.safeParse(site.currentVersion.data);
  if (!parsed.success) {
    throw new Error("現行の構造化データが不正です");
  }
  return { site, currentVersion: site.currentVersion, data: parsed.data };
}

/**
 * 自然文の指示から編集を実行する。
 * モデルが操作を提案 → 検証適用 → 変更があれば新バージョンを作る。
 */
export async function runEdit(
  input: RunEditInput,
  model: EditModel,
): Promise<RunEditResult> {
  const { site, data } = await loadCurrent(input.facilityId);

  // 解約後(static)は AI編集不可（公開は継続するが編集のみ停止）。再契約で再開。
  if (site.publishState === "static") {
    return {
      applied: false,
      appliedCount: 0,
      rejected: [],
      message:
        "解約中のため、AIでの編集はご利用いただけません。再契約いただくと編集を再開できます。",
      slug: site.slug,
      siteId: site.id,
      versionId: site.currentVersionId!,
    };
  }

  const editRequest = await prisma.editRequest.create({
    data: {
      facilityId: input.facilityId,
      channel: input.channel,
      rawInput: input.instruction,
      status: "received",
    },
  });

  // モデルへ提案を依頼（失敗は EditRequest に記録して上位へ）。
  let proposal;
  try {
    proposal = await model.proposeEdits({ currentData: data, instruction: input.instruction });
  } catch (e) {
    await prisma.editRequest.update({
      where: { id: editRequest.id },
      data: { status: "failed", rejectionReason: (e as Error).message },
    });
    throw e;
  }

  // 画像生成オペ(generate_image)は副作用を伴うため、適用前に実生成→URL化して解決する。
  const resolved = await resolveImageOps(input.facilityId, proposal.ops);
  const { data: nextData, appliedCount, rejected } = applyOps(data, resolved.ops);

  await prisma.editRequest.update({
    where: { id: editRequest.id },
    data: {
      status: appliedCount > 0 ? "applied" : "rejected",
      parsed: { instruction: input.instruction },
      structured: {
        ops: proposal.ops,
        message: proposal.message,
        imagesGenerated: resolved.generated,
      },
      rejectionReason: appliedCount === 0 ? "適用可能な変更がありませんでした" : null,
    },
  });

  // 変更なし: 現行バージョンのまま返す。
  if (appliedCount === 0) {
    return {
      applied: false,
      appliedCount: 0,
      rejected,
      message: proposal.message,
      slug: site.slug,
      siteId: site.id,
      versionId: site.currentVersionId!,
    };
  }

  const origin = input.channel === "email" ? "ai_email" : "ai_editor";

  const newVersionId = await prisma.$transaction(async (tx) => {
    const version = await tx.siteVersion.create({
      data: {
        siteId: site.id,
        facilityId: input.facilityId,
        data: nextData,
        origin,
        note: `AI編集(${input.channel})`,
      },
    });
    await tx.generatedSite.update({
      where: { id: site.id },
      data: { currentVersionId: version.id },
    });
    await tx.leadEvent.create({
      data: {
        facilityId: input.facilityId,
        type: "ai_edit",
        meta: { channel: input.channel, appliedCount, editRequestId: editRequest.id },
      },
    });
    await tx.auditLog.create({
      data: {
        facilityId: input.facilityId,
        action: "site.ai_edit",
        actor: input.actor ?? "system",
        before: { versionId: site.currentVersionId },
        after: { versionId: version.id, ops: proposal.ops },
      },
    });
    return version.id;
  });

  return {
    applied: true,
    appliedCount,
    rejected,
    message: proposal.message,
    slug: site.slug,
    siteId: site.id,
    versionId: newVersionId,
  };
}
