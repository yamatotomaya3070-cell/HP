// サービス案内のトップページ（公開・index可）。
// 役割: 決済会社(Stripe)の審査や事業所からの直接アクセスに対して「何を・いくらで・誰が」提供しているかを示す。
// 料金や日数は billing/lifecycle の定数を単一の情報源として参照する（ここに数字を直書きしない）。

import type { Metadata } from "next";
import {
  TRIAL_DAYS,
  MONTHLY_FEE,
  MONTHLY_FEE_PRO,
  PRO_EDIT_FEE,
  PRO_EDIT_FEE_PRO_PLAN,
} from "@/server/billing/lifecycle.js";
import { MAX_FREE_EDITS } from "@/server/billing/entitlement.js";

const SERVICE_NAME = "福祉パートナー";
const OPERATOR_NAME = "合同会社絆";

export const metadata: Metadata = {
  title: `${SERVICE_NAME} | 就労継続支援B型事業所のAIホームページ作成サービス`,
  description:
    "就労継続支援B型事業所向けに、AIに話しかけるだけで編集できるホームページを提供します。" +
    `${TRIAL_DAYS}日間無料、月額${MONTHLY_FEE.toLocaleString()}円から。`,
};

const STEPS = [
  {
    title: "ホームページの下書きをお届け",
    body: "公開情報をもとに、事業所ごとのホームページをこちらで作成し、プレビューリンクをお送りします。",
  },
  {
    title: "AIに話しかけて直す",
    body: "「営業時間を9時からに」「送迎ありと書いて」のように日本語で伝えるだけ。AIが内容を書き換えます。",
  },
  {
    title: "納得したら公開",
    body: `${TRIAL_DAYS}日間の無料体験のあと、月額プランでそのまま公開。解約後もページは残ります。`,
  },
] as const;

const PLANS = [
  {
    name: "無料プラン",
    price: "¥0",
    rows: [`ホームページの閲覧`, `AI編集（${MAX_FREE_EDITS}回まで）`],
  },
  {
    name: "通常プラン",
    price: `¥${MONTHLY_FEE.toLocaleString()}`,
    suffix: "/月（税込）",
    recommended: true,
    rows: ["AI編集し放題", "ホームページ公開", `${TRIAL_DAYS}日間無料体験`],
  },
  {
    name: "上級プラン",
    price: `¥${MONTHLY_FEE_PRO.toLocaleString()}`,
    suffix: "/月（税込）",
    rows: ["AI編集し放題", "ホームページ公開", "プロに相談できる", `${TRIAL_DAYS}日間無料体験`],
  },
] as const;

export default function HomePage() {
  const contact = process.env.MAIL_SENDER_CONTACT?.trim();
  return (
    <main style={S.wrap}>
      <section style={S.hero} aria-labelledby="hero-heading">
        <p style={S.eyebrow}>就労継続支援B型事業所向け</p>
        <h1 id="hero-heading" style={S.h1}>
          AIに話しかけるだけで、
          <br />
          事業所のホームページが整う。
        </h1>
        <p style={S.lead}>
          {SERVICE_NAME}は、HTMLもデザインの知識もいらないホームページ作成サービスです。
          直したいところを日本語で伝えれば、AIがその場で書き換えます。
        </p>
      </section>

      <section style={S.section} aria-labelledby="steps-heading">
        <h2 id="steps-heading" style={S.h2}>
          ご利用の流れ
        </h2>
        <ol style={S.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} style={S.step}>
              <span style={S.stepNo} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 style={S.h3}>{s.title}</h3>
                <p style={S.p}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section style={S.section} aria-labelledby="plans-heading">
        <h2 id="plans-heading" style={S.h2}>
          料金プラン
        </h2>
        <div style={S.plans}>
          {PLANS.map((p) => (
            <div key={p.name} style={{ ...S.plan, ...("recommended" in p ? S.planOn : null) }}>
              <div style={S.planHead}>
                <span style={S.planName}>{p.name}</span>
                <p style={S.planPrice}>
                  {p.price}
                  {"suffix" in p && <span style={S.planSuffix}>{p.suffix}</span>}
                </p>
              </div>
              <ul style={S.planRows}>
                {p.rows.map((r) => (
                  <li key={r} style={S.planRow}>
                    <span style={S.tick} aria-hidden="true">
                      ✓
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <ul style={S.notes}>
          <li>お支払いはクレジットカード（決済は Stripe が処理し、当社ではカード情報を保存しません）。</li>
          <li>無料体験中に解約すれば料金はかかりません。解約後もホームページは公開されたまま残ります（編集のみ停止）。</li>
          <li>
            プロによる編集の実作業は都度 {PRO_EDIT_FEE.toLocaleString()}円（上級プランは
            {PRO_EDIT_FEE_PRO_PLAN.toLocaleString()}円）です。
          </li>
          <li>お申し込みは、こちらからお送りするご案内メールまたはLINEのリンクから行えます。</li>
        </ul>
      </section>

      <footer style={S.footer}>
        <p style={S.footerLine}>
          運営：{OPERATOR_NAME}
          {contact && <span>　お問い合わせ：{contact}</span>}
        </p>
        <p style={S.footerLine}>© {new Date().getFullYear()} {OPERATOR_NAME}</p>
      </footer>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    padding: "clamp(2rem,1rem+4vw,4rem) 1rem 3rem",
    background: "linear-gradient(160deg,#eafaf0,#fbe6d2)",
    fontFamily:
      '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,system-ui,sans-serif',
    color: "#253026",
  },
  hero: { width: "min(100% - 2rem, 720px)", margin: "0 auto 2.5rem", textAlign: "center" },
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
  h1: { fontSize: "clamp(1.6rem,1rem+2.6vw,2.4rem)", lineHeight: 1.35, margin: "0 0 1rem" },
  lead: { fontSize: "1.02rem", lineHeight: 1.9, color: "#4c5a4f", margin: 0 },
  section: {
    width: "min(100% - 2rem, 640px)",
    margin: "0 auto 1.6rem",
    background: "#fff",
    borderRadius: 24,
    padding: "clamp(1.4rem,1rem+2vw,2.2rem)",
    boxShadow: "0 20px 50px -20px rgba(37,48,38,.35)",
  },
  h2: { fontSize: "1.25rem", margin: "0 0 1.1rem" },
  h3: { fontSize: "1.02rem", margin: "0 0 .3rem" },
  p: { fontSize: ".95rem", lineHeight: 1.8, color: "#4c5a4f", margin: 0 },
  steps: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" },
  step: { display: "flex", gap: ".9rem", alignItems: "flex-start" },
  stepNo: {
    flexShrink: 0,
    width: "2rem",
    height: "2rem",
    borderRadius: 999,
    background: "#2f8f5b",
    color: "#fff",
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
  },
  plans: { display: "grid", gap: ".9rem", gridTemplateColumns: "1fr", margin: "0 0 1.2rem" },
  plan: { border: "1px solid #e4eae6", borderRadius: 16, padding: "1.1rem 1.2rem", background: "#fff" },
  planOn: { border: "2px solid #2f8f5b", background: "#f4faf6" },
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
  planName: { fontWeight: 800, fontSize: "1.12rem" },
  planPrice: { fontSize: "1.6rem", fontWeight: 800, margin: 0, whiteSpace: "nowrap" },
  planSuffix: { fontSize: ".85rem", fontWeight: 600, color: "#6b7a6f", marginLeft: ".15em" },
  planRows: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".5rem" },
  planRow: { display: "flex", alignItems: "center", gap: ".55rem", fontSize: ".95rem", lineHeight: 1.5 },
  tick: { color: "#2f8f5b", fontWeight: 800, width: "1em", flexShrink: 0 },
  notes: { margin: 0, paddingLeft: "1.2em", fontSize: ".86rem", lineHeight: 1.8, color: "#4c5a4f" },
  footer: { width: "min(100% - 2rem, 640px)", margin: "0 auto", textAlign: "center" },
  footerLine: { fontSize: ".82rem", color: "#6b7a6f", margin: ".2rem 0" },
};
