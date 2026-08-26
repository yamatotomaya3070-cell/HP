// 決済導線の入口ページ。マジックリンク（billing token）で到達し、プラン説明＋CTAを出す。
// CTAは /api/billing/checkout?token=... に遷移し、Stripe（キーがあれば本番）Checkout へ。

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.js";
import { verifyToken } from "@/lib/tokens.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "ホームページの公開手続き",
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const auth = verifyToken(token, "billing");
  if (!auth.ok) {
    return (
      <main style={S.wrap}>
        <div style={S.card}>
          <h1 style={S.h1}>リンクが無効です</h1>
          <p style={S.p}>
            お手数ですが、担当者へ新しいリンクの発行をご依頼ください。
          </p>
        </div>
      </main>
    );
  }

  const facility = await prisma.facility.findUnique({
    where: { id: auth.facilityId },
    select: { name: true },
  });
  if (!facility) notFound();

  const checkoutHref = `/api/billing/checkout?token=${encodeURIComponent(token)}&type=trial`;

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <p style={S.eyebrow}>ホームページの公開手続き</p>
        <h1 style={S.h1}>{facility.name} さまのホームページを公開しましょう</h1>
        <p style={S.p}>
          まずは<strong>14日間無料でお試し</strong>いただけます。体験期間中はいつでも無料で解約できます。
        </p>

        <ul style={S.list}>
          <li>✅ 14日間の無料体験（カード登録のみ・体験中は課金なし）</li>
          <li>✅ 体験中もAIチャット・メール返信で何度でも修正</li>
          <li>✅ 気に入ったらそのまま公開、合わなければ無料で解約</li>
          <li>🔒 カード情報は決済会社（Stripe）が安全に処理し、当社では保存しません</li>
        </ul>

        <a href={checkoutHref} style={S.cta}>
          カード登録して14日無料で始める →
        </a>

        <p style={S.note}>
          ボタンを押すと安全な決済ページ（Stripe）へ移動します。
        </p>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "2rem 1rem",
    background: "linear-gradient(160deg,#eafaf0,#fbe6d2)",
    fontFamily:
      '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,system-ui,sans-serif',
    color: "#253026",
  },
  card: {
    width: "min(100% - 2rem, 560px)",
    background: "#fff",
    borderRadius: 24,
    padding: "clamp(1.6rem,1rem+3vw,2.6rem)",
    boxShadow: "0 20px 50px -20px rgba(37,48,38,.35)",
  },
  eyebrow: {
    display: "inline-block",
    fontSize: ".78rem",
    fontWeight: 800,
    letterSpacing: ".12em",
    color: "#1f6f44",
    background: "#eaf5ee",
    padding: ".35em .9em",
    borderRadius: 999,
    margin: "0 0 1rem",
  },
  h1: { fontSize: "clamp(1.3rem,1rem+1.6vw,1.8rem)", lineHeight: 1.4, margin: "0 0 1rem" },
  p: { fontSize: "1rem", lineHeight: 1.9, color: "#4c5a4f", margin: "0 0 1.2rem" },
  list: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 1.8rem",
    display: "grid",
    gap: ".6rem",
    fontSize: ".96rem",
    lineHeight: 1.7,
  },
  cta: {
    display: "block",
    textAlign: "center",
    background: "#2f8f5b",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: "1.05rem",
    padding: "1rem 1.4rem",
    borderRadius: 999,
    boxShadow: "0 10px 24px -10px rgba(47,143,91,.6)",
  },
  note: { fontSize: ".82rem", color: "#6b7a6f", textAlign: "center", margin: "1rem 0 0" },
};
