// 非公開プレビュー。推測不可 slug でのみ到達可能・noindex。
// currentVersion.data を検証してテンプレに渡す。壊れたデータは 404 扱いにせず明示エラー。

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db.js";
import { siteDataSchema } from "@/lib/siteData.js";
import { SiteTemplate } from "@/components/site/SiteTemplate.js";

export const dynamic = "force-dynamic";

// プレビューは常に noindex（検索エンジンに載せない）。
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

async function loadSite(slug: string) {
  const site = await prisma.generatedSite.findUnique({
    where: { slug },
    include: { currentVersion: true, facility: true },
  });
  if (!site || !site.currentVersion) return null;
  return site;
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) notFound();

  const parsed = siteDataSchema.safeParse(site.currentVersion!.data);
  if (!parsed.success) {
    // データ破損は握りつぶさず、プレビュー上で明示（本番は管理画面へ記録）。
    return (
      <main style={{ padding: "3rem", fontFamily: "system-ui" }}>
        <h1>プレビューを表示できません</h1>
        <p>このサイトの構造化データが不正です。管理者にお問い合わせください。</p>
      </main>
    );
  }

  return (
    <>
      <div className="preview-banner">
        非公開プレビュー ・ このURLは検索エンジンに表示されません
      </div>
      <div className="preview-notice">
        ⚠️ この内容はAIが自動生成したサンプルです。文章・画像は御社の実際の内容と異なる場合があります。
        このメールにご返信いただければ、無料で修正します（例：「送迎あります」「工賃は月平均〇円」など）。
      </div>
      <SiteTemplate data={parsed.data} />
    </>
  );
}
