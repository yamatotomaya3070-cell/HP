// 独自ドメインでの公開配信（(B)）。middleware が host→/site/<domain> に書き換えて到達する。
// プレビュー(/preview)と違い、検索エンジンに載せる（index 許可）・バナー無し。
// 公開状態（published/static）かつドメイン検証済みのときだけ配信し、それ以外は 404。

import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db.js";
import { siteDataSchema } from "@/lib/siteData.js";
import { SiteTemplate } from "@/components/site/SiteTemplate.js";

export const dynamic = "force-dynamic";

/** ドメインで公開可能なサイトを取得（metadata とページで共有し二重取得を避ける）。 */
const loadByDomain = cache(async (domain: string) => {
  const site = await prisma.generatedSite.findUnique({
    where: { customDomain: domain },
    include: { currentVersion: true, facility: true },
  });
  if (!site || !site.currentVersion) return null;
  const servable =
    (site.publishState === "published" || site.publishState === "static") &&
    site.domainVerifiedAt != null;
  return servable ? site : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const site = await loadByDomain(decodeURIComponent(domain));
  if (!site) return { robots: { index: false, follow: false } };
  return {
    title: site.facility.name,
    robots: { index: true, follow: true },
  };
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const site = await loadByDomain(decodeURIComponent(domain));
  if (!site) notFound();

  const parsed = siteDataSchema.safeParse(site.currentVersion!.data);
  if (!parsed.success) notFound();

  return <SiteTemplate data={parsed.data} />;
}
