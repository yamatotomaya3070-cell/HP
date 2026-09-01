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

  const checkoutHref = `/api/billing/checkout?token=${encodeURIComponent(token)}&type=trial`;

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
            name="梅"
            price="¥0"
            rows={[
              { label: "ホームページを見る", ok: true },
              { label: "AI編集（3回まで）", ok: true },
              { label: "編集し放題", ok: false },
              { label: "ホームページ公開", ok: false },
            ]}
          />
          <PlanCard
            name="竹"
            price={`¥${MONTHLY_FEE.toLocaleString()}`}
            suffix="/月"
            recommended
            rows={[
              { label: "編集し放題", ok: true },
              { label: "ホームページ公開", ok: true },
              { label: "プロに相談", ok: false },
            ]}
          />
          <PlanCard
            name="松"
            price={`¥${MONTHLY_FEE_PRO.toLocaleString()}`}
            suffix="/月"
            rows={[
              { label: "編集し放題", ok: true },
              { label: "ホームページ公開", ok: true },
              { label: "プロに相談できる", ok: true },
            ]}
          />
        </div>

        <a href={checkoutHref} style={S.cta}>
          {TRIAL_DAYS}日間無料ではじめる →
        </a>

        <ul style={S.list}>
          <li>🔒 カード情報は決済会社（Stripe）が安全に処理し、当社では保存しません</li>
          <li>✅ 体験期間中に解約すれば料金はかかりません</li>
          <li>✅ 解約後もホームページは公開されたまま残ります（編集のみ停止）</li>
        </ul>

        <p style={S.note}>
          ※プロによる編集の実作業は都度{PRO_EDIT_FEE.toLocaleString()}円（松プランは
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
}: {
  name: string;
  price: string;
  suffix?: string;
  rows: { label: string; ok: boolean }[];
  recommended?: boolean;
}) {
  return (
    <div style={{ ...S.plan, ...(recommended ? S.planOn : null) }}>
      <div style={S.planHead}>
        <span style={S.planName}>{name}</span>
        {recommended && <span style={S.badge}>おすすめ</span>}
      </div>
      <p style={S.planPrice}>
        {price}
        {suffix && <span style={S.planSuffix}>{suffix}</span>}
      </p>
      <ul style={S.planRows}>
        {rows.map((r) => (
          <li key={r.label} style={{ ...S.planRow, ...(r.ok ? null : S.planRowOff) }}>
            <span aria-hidden="true">{r.ok ? "✓" : "×"}</span> {r.label}
          </li>
        ))}
      </ul>
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
  plans: {
    display: "grid",
    gap: ".7rem",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    margin: "0 0 1.6rem",
  },
  plan: {
    border: "1px solid #e4eae6",
    borderRadius: 14,
    padding: "1rem .9rem",
    background: "#fff",
  },
  planOn: {
    border: "2px solid #2f8f5b",
    background: "#f2faf5",
  },
  planHead: { display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".2rem" },
  planName: { fontWeight: 800, fontSize: "1rem" },
  badge: {
    fontSize: ".68rem",
    fontWeight: 700,
    color: "#1f6f44",
    background: "#dff0e6",
    padding: ".15em .6em",
    borderRadius: 999,
  },
  planPrice: { fontSize: "1.5rem", fontWeight: 800, margin: ".1rem 0 .7rem" },
  planSuffix: { fontSize: ".8rem", fontWeight: 600, color: "#6b7a6f" },
  planRows: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".35rem" },
  planRow: { fontSize: ".85rem", lineHeight: 1.5, color: "#253026" },
  planRowOff: { color: "#b9c4be" },
  card: {
    width: "min(100% - 2rem, 720px)",
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
