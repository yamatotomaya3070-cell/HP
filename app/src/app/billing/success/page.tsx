// 決済完了ページ（Stripe success_url の既定遷移先）。
import type { Metadata } from "next";
import { TRIAL_DAYS } from "@/server/billing/pricing.js";

export const dynamic = "force-static";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "お手続きありがとうございます",
};

export default function BillingSuccess() {
  return (
    <main style={wrap}>
      <div style={card}>
        <div style={{ fontSize: "3rem" }}>🎉</div>
        <h1 style={h1}>お手続きありがとうございます</h1>
        <p style={p}>
          {TRIAL_DAYS}日間の無料体験を開始しました。担当者より、公開までの流れをご案内いたします。
          引き続き、ご不明点はメールのご返信でお気軽にお知らせください。
        </p>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "2rem 1rem",
  background: "linear-gradient(160deg,#eafaf0,#d6efe0)",
  fontFamily: '"Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,system-ui,sans-serif',
  color: "#253026",
  textAlign: "center",
};
const card: React.CSSProperties = {
  width: "min(100% - 2rem, 480px)",
  background: "#fff",
  borderRadius: 24,
  padding: "2.4rem",
  boxShadow: "0 20px 50px -20px rgba(37,48,38,.35)",
};
const h1: React.CSSProperties = { fontSize: "1.5rem", margin: "0.6rem 0 1rem" };
const p: React.CSSProperties = { fontSize: "1rem", lineHeight: 1.9, color: "#4c5a4f", margin: 0 };
