// 事業所→初期HP生成。共通テンプレは触らず、構造化データ(SiteVersion.data)のみ作る。
// （注: 営業配信 runCampaign は status=site_generated を対象にするため、配信前にこの生成が必要）
// GeneratedSite（推測不可 slug・draft）＋ 初期 SiteVersion(origin=import) を作成し、
// currentVersion に紐付け、状態を site_generated へ。行動ログ・監査ログを必ず記録。

import { prisma } from "@/lib/db.js";
import { generateSlug } from "@/lib/slug.js";
import { siteDataSchema } from "@/lib/siteData.js";
import { buildInitialSiteData } from "./buildInitialSiteData.js";

export interface GenerateResult {
  siteId: string;
  slug: string;
  versionId: string;
  created: boolean; // 新規生成なら true、既存でスキップなら false
}

/** 衝突しない slug を確保する（極めて低確率だが一意制約に備える）。 */
async function reserveUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    const existing = await prisma.generatedSite.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new Error("slug の一意確保に失敗しました");
}

/**
 * 事業所IDからHPを生成する。
 * 既にサイトがある場合は再生成せず既存を返す（force で明示的に別バージョンを足す運用は別途）。
 */
export async function generateSiteForFacility(
  facilityId: string,
): Promise<GenerateResult> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
  });
  if (!facility) {
    throw new Error(`事業所が見つかりません: ${facilityId}`);
  }

  const existing = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
  });
  if (existing?.currentVersionId) {
    return {
      siteId: existing.id,
      slug: existing.slug,
      versionId: existing.currentVersionId,
      created: false,
    };
  }

  const data = buildInitialSiteData({
    name: facility.name,
    corpName: facility.corpName,
    address: facility.address,
    prefecture: facility.prefecture,
    tel: facility.tel,
    fax: facility.fax,
    url: facility.url,
    email: facility.email,
  });
  // 生成物が契約(スキーマ)を満たすことを保証してから保存する。
  const validated = siteDataSchema.parse(data);

  const slug = await reserveUniqueSlug();

  const result = await prisma.$transaction(async (tx) => {
    const site = await tx.generatedSite.create({
      data: { facilityId, slug, publishState: "draft" },
    });
    const version = await tx.siteVersion.create({
      data: {
        siteId: site.id,
        facilityId,
        data: validated,
        origin: "import",
        note: "初期生成",
      },
    });
    await tx.generatedSite.update({
      where: { id: site.id },
      data: { currentVersionId: version.id },
    });
    await tx.facility.update({
      where: { id: facilityId },
      data: { status: "site_generated" },
    });
    await tx.leadEvent.create({
      data: {
        facilityId,
        type: "site_generated",
        meta: { siteId: site.id, slug },
      },
    });
    await tx.auditLog.create({
      data: {
        facilityId,
        action: "site.generate",
        actor: "system",
        after: { siteId: site.id, slug, versionId: version.id },
      },
    });
    return { siteId: site.id, versionId: version.id };
  });

  return { siteId: result.siteId, slug, versionId: result.versionId, created: true };
}
