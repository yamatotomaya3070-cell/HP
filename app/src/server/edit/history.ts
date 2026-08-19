// 変更履歴の一覧と復元（仕様: 履歴・復元）。
// 復元は破壊的に巻き戻さず、選んだバージョンの内容で「新しいバージョン」を作る（追記型）。

import { prisma } from "@/lib/db.js";
import { siteDataSchema } from "@/lib/siteData.js";

export interface VersionSummary {
  id: string;
  origin: string;
  note: string | null;
  createdAt: string;
  isCurrent: boolean;
}

/** 事業所のサイトのバージョン履歴（新しい順）。 */
export async function listVersions(facilityId: string): Promise<VersionSummary[]> {
  const site = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
    include: {
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!site) return [];
  return site.versions.map((v) => ({
    id: v.id,
    origin: v.origin,
    note: v.note,
    createdAt: v.createdAt.toISOString(),
    isCurrent: v.id === site.currentVersionId,
  }));
}

export interface RestoreResult {
  versionId: string;
  slug: string;
}

/** 指定バージョンの内容で新バージョンを作り、現行に設定する。 */
export async function restoreVersion(
  facilityId: string,
  targetVersionId: string,
  actor = "system",
): Promise<RestoreResult> {
  const site = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
  });
  if (!site) throw new Error("サイトが見つかりません");

  const target = await prisma.siteVersion.findFirst({
    where: { id: targetVersionId, siteId: site.id },
  });
  if (!target) throw new Error("対象バージョンが見つかりません");

  // 復元対象データも契約を満たすか検証してから使う。
  const data = siteDataSchema.parse(target.data);

  const newVersionId = await prisma.$transaction(async (tx) => {
    const version = await tx.siteVersion.create({
      data: {
        siteId: site.id,
        facilityId,
        data,
        origin: "restore",
        note: `復元元: ${target.id}`,
      },
    });
    await tx.generatedSite.update({
      where: { id: site.id },
      data: { currentVersionId: version.id },
    });
    await tx.auditLog.create({
      data: {
        facilityId,
        action: "site.restore",
        actor,
        before: { versionId: site.currentVersionId },
        after: { versionId: version.id, restoredFrom: target.id },
      },
    });
    return version.id;
  });

  return { versionId: newVersionId, slug: site.slug };
}
