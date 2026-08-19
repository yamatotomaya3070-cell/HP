// 配信停止の確認ページ。トークンを検証し、正当ならボタンで停止（POST）できるようにする。
// noindex（検索エンジンに載せない）。

import type { Metadata } from "next";
import { verifyUnsubscribeToken } from "@/server/mail/unsubscribe.js";
import { UnsubscribeClient } from "@/components/unsubscribe/UnsubscribeClient.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const auth = verifyUnsubscribeToken(token);

  return (
    <main style={{ padding: "3rem", fontFamily: "system-ui", maxWidth: "40rem" }}>
      <h1>配信停止</h1>
      {auth.ok ? (
        <UnsubscribeClient token={token} />
      ) : (
        <p>このリンクは無効か、期限が切れています。お手数ですが受信したメールにご返信ください。</p>
      )}
    </main>
  );
}
