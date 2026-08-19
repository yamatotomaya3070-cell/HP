// 公開前確認画面。publish トークンを検証し、掲載内容のレビュー＋チェックリストを表示。
// 期限切れ・無効トークンは表示しない（仕様: 期限付き・事業所専用）。

import type { Metadata } from "next";
import { prisma } from "@/lib/db.js";
import { verifyToken } from "@/lib/tokens.js";
import { siteDataSchema } from "@/lib/siteData.js";
import { buildPublishReview } from "@/lib/prePublish.js";
import { PublishConfirmClient } from "@/components/publish/PublishConfirmClient.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "ホームページ公開前の確認",
};

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.4rem" }}>{title}</h1>
      <p style={{ color: "#555", lineHeight: 1.9 }}>{body}</p>
    </main>
  );
}

export default async function PublishPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const auth = verifyToken(token, "publish");

  if (!auth.ok) {
    return auth.reason === "expired" ? (
      <Notice
        title="確認リンクの有効期限が切れています"
        body="お手数ですが、最新の確認リンクをメールでお受け取りください。"
      />
    ) : (
      <Notice title="確認リンクが無効です" body="リンクが正しくコピーされているかご確認ください。" />
    );
  }

  const site = await prisma.generatedSite.findFirst({
    where: { facilityId: auth.facilityId },
    orderBy: { createdAt: "asc" },
    include: { facility: true, currentVersion: true },
  });
  if (!site || !site.currentVersion) {
    return (
      <Notice
        title="ホームページが見つかりません"
        body="このリンクに対応するホームページがまだ作成されていません。"
      />
    );
  }

  const parsed = siteDataSchema.safeParse(site.currentVersion.data);
  if (!parsed.success) {
    return (
      <Notice
        title="内容を読み込めませんでした"
        body="お手数ですが、担当までお問い合わせください。"
      />
    );
  }

  const review = buildPublishReview(parsed.data, site.facility.name);
  const alreadyPublished =
    site.publishState === "published" || site.publishState === "static";

  return (
    <PublishConfirmClient
      token={token}
      facilityName={site.facility.name}
      slug={site.slug}
      review={review}
      alreadyPublished={alreadyPublished}
    />
  );
}
