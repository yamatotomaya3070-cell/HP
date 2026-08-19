// マジックリンク編集画面。トークンを検証し、事業所のサイトを左チャット/右プレビューで編集。
// 期限切れ・無効トークンは編集させない（仕様: 期限付き・事業所専用・他事業所編集不可）。

import type { Metadata } from "next";
import { prisma } from "@/lib/db.js";
import { verifyToken } from "@/lib/tokens.js";
import { EditorClient } from "@/components/editor/EditorClient.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "ホームページ編集",
};

function InvalidNotice({ title, body }: { title: string; body: string }) {
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.4rem" }}>{title}</h1>
      <p style={{ color: "#555", lineHeight: 1.9 }}>{body}</p>
    </main>
  );
}

export default async function EditPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const auth = verifyToken(token, "edit");

  if (!auth.ok) {
    return auth.reason === "expired" ? (
      <InvalidNotice
        title="編集リンクの有効期限が切れています"
        body="お手数ですが、最新の編集リンクをメールでお受け取りください。"
      />
    ) : (
      <InvalidNotice
        title="編集リンクが無効です"
        body="リンクが正しくコピーされているかご確認ください。"
      />
    );
  }

  const site = await prisma.generatedSite.findFirst({
    where: { facilityId: auth.facilityId },
    orderBy: { createdAt: "asc" },
    include: { facility: true },
  });
  if (!site) {
    return (
      <InvalidNotice
        title="ホームページが見つかりません"
        body="このリンクに対応するホームページがまだ作成されていません。"
      />
    );
  }

  return (
    <EditorClient
      token={token}
      slug={site.slug}
      facilityName={site.facility.name}
    />
  );
}
