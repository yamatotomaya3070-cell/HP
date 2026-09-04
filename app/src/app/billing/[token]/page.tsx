// 決済導線の入口ページ。マジックリンク（billing token）で到達し、プラン説明＋CTAを出す。
// CTAは /api/billing/checkout?token=... に遷移し、Stripe（キーがあれば本番）Checkout へ。

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db.js";
import { verifyToken } from "@/lib/tokens.js";
import {
  TRIAL_DAYS,
  MONTHLY_FEE,
  MONTHLY_FEE_PRO,
  PRO_EDIT_FEE,
  PRO_EDIT_FEE_PRO_PLAN,
} from "@/server/billing/lifecycle.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "プランのご案内",
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

  const checkoutHref = (plan: "standard" | "pro") =>
    `/api/billing/checkout?token=${encodeURIComponent(token)}&type=trial&plan=${plan}`;

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <p style={S.eyebrow}>プランのご案内</p>
        <h1 style={S.h1}>{facility.name} さまのホームページ</h1>
        <p style={S.p}>
          ご登録いただくと<strong>編集が使い放題</strong>になり、ホームページを公開できます。
          まずは<strong>{TRIAL_DAYS}日間無料</strong>。体験中はいつでも無料で解約できます。
        </p>

        <div style={S.plans}>
          <PlanCard
            name="無料プラン"
            price="¥0"
            rows={[
              { label: "ホームページを見る", ok: true },
              { label: "AI編集（3回まで）", ok: true },
              { label: "編集し放題", ok: false },
              { label: "ホームページ公開", ok: false },
            ]}
          />
          <PlanCard
            name="通常プラン"
            price={`¥${MONTHLY_FEE.toLocaleString()}`}
            suffix="/月"
            recommended
            rows={[
              { label: "編集し放題", ok: true },
              { label: "ホームページ公開", ok: true },
              { label: "プロに相談", ok: false },
            ]}
            ctaHref={checkoutHref("standard")}
            ctaLabel={`${TRIAL_DAYS}日間無料ではじめる →`}
          />
          <PlanCard
            name="上級プラン"
            price={`¥${MONTHLY_FEE_PRO.toLocaleString()}`}
            suffix="/月"
            rows={[
              { label: "編集し放題", ok: true },
              { label: "ホームページ公開", ok: true },
              { label: "プロに相談できる", ok: true },
            ]}
            ctaHref={checkoutHref("pro")}
            ctaLabel={`${TRIAL_DAYS}日間無料ではじめる →`}
          />
        </div>

        <ul style={S.list}>
          <li>🔒 カード情報は決済会社（Stripe）が安全に処理し、当社では保存しません</li>
          <li>✅ 体験期間中に解約すれば料金はかかりません</li>
          <li>✅ 解約後もホームページは公開されたまま残ります（編集のみ停止）</li>
        </ul>

        <p style={S.note}>
          ※プロによる編集の実作業は都度{PRO_EDIT_FEE.toLocaleString()}円（上級プランは
          {PRO_EDIT_FEE_PRO_PLAN.toLocaleString()}円）です。
        </p>
      </div>
    </main>
  );
}

function PlanCard({
  name,
  price,
  suffix,
  rows,
  recommended = false,
  ctaHref,
  ctaLabel,
}: {
  name: string;
  price: string;
  suffix?: string;
  rows: { label: string; ok: boolean }[];
  recommended?: boolean;
  /** 指定があれば、このプラン専用の登録ボタンをカード内に出す（無料プランは指定しない）。 */
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div style={{ ...S.plan, ...(recommended ? S.planOn : null) }}>
      <div style={S.planHead}>
        <div style={S.planNameWrap}>
          <span style={S.planName}>{name}</span>
          {recommended && <span style={S.badge}>おすすめ</span>}
        </div>
        <p style={S.planPrice}>
          {price}
          {suffix && <span style={S.planSuffix}>{suffix}</span>}
        </p>
      </div>
      <ul style={S.planRows}>
        {rows.map((r) => (
          <li key={r.label} style={{ ...S.planRow, ...(r.ok ? null : S.planRowOff) }}>
            <span style={r.ok ? S.tickOn : S.tickOff} aria-hidden="true">
              {r.ok ? "✓" : "×"}
            </span>
            {r.label}
          </li>
        ))}
      </ul>
      {ctaHref && (
        <a href={ctaHref} style={recommended ? S.cta : S.ctaSecondary}>
          {ctaLabel}
        </a>
      )}
    </div>
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
  // プランは縦に積む。横並びだと1枚が細くなり、スマホ（LINEのアプリ内ブラウザ）で読みにくい。
  plans: {
    display: "grid",
    gap: ".9rem",
    gridTemplateColumns: "1fr",
    margin: "0 0 1.6rem",
  },
  plan: {
    border: "1px solid #e4eae6",
    borderRadius: 16,
    padding: "1.1rem 1.2rem",
    background: "#fff",
  },
  planOn: {
    border: "2px solid #2f8f5b",
    background: "#f4faf6",
    boxShadow: "0 6px 18px -12px rgba(47,143,91,.7)",
  },
  // 名前は左、価格は右。1行で「何がいくらか」が読める。
  planHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: ".8rem",
    flexWrap: "wrap",
    paddingBottom: ".7rem",
    marginBottom: ".7rem",
    borderBottom: "1px solid #eef2ef",
  },
  planNameWrap: { display: "flex", alignItems: "center", gap: ".5rem" },
  planName: { fontWeight: 800, fontSize: "1.12rem" },
  badge: {
    fontSize: ".7rem",
    fontWeight: 700,
    color: "#fff",
    background: "#2f8f5b",
    padding: ".2em .7em",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  planPrice: { fontSize: "1.6rem", fontWeight: 800, margin: 0, whiteSpace: "nowrap" },
  planSuffix: { fontSize: ".85rem", fontWeight: 600, color: "#6b7a6f", marginLeft: ".15em" },
  planRows: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".5rem" },
  planRow: {
    display: "flex",
    alignItems: "center",
    gap: ".55rem",
    fontSize: ".95rem",
    lineHeight: 1.5,
    color: "#253026",
  },
  planRowOff: { color: "#a8b4ad" },
  tickOn: { color: "#2f8f5b", fontWeight: 800, width: "1em", flexShrink: 0 },
  tickOff: { color: "#c3cdc7", fontWeight: 800, width: "1em", flexShrink: 0 },
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
    fontSize: ".98rem",
    padding: ".85rem 1.2rem",
    borderRadius: 999,
    marginTop: ".9rem",
    boxShadow: "0 10px 24px -10px rgba(47,143,91,.6)",
  },
  ctaSecondary: {
    display: "block",
    textAlign: "center",
    background: "#fff",
    color: "#2f8f5b",
    border: "1.5px solid #2f8f5b",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: ".98rem",
    padding: ".85rem 1.2rem",
    borderRadius: 999,
    marginTop: ".9rem",
  },
  note: { fontSize: ".82rem", color: "#6b7a6f", textAlign: "center", margin: "1rem 0 0" },
};
