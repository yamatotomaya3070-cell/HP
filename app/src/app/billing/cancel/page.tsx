// 決済キャンセルページ（Stripe cancel_url の既定遷移先）。
import type { Metadata } from "next";

export const dynamic = "force-static";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "お手続きを中断しました",
};

export default function BillingCancel() {
  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={h1}>お手続きを中断しました</h1>
        <p style={p}>
          カードの登録は行われていません。ご不明な点があれば、メールのご返信でお気軽にお尋ねください。
          もう一度お手続きされる場合は、担当者へリンクの再発行をご依頼ください。
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
  background: "linear-gradient(160deg,#fdf0e2,#f9dcc2)",
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
const h1: React.CSSProperties = { fontSize: "1.4rem", margin: "0 0 1rem" };
const p: React.CSSProperties = { fontSize: "1rem", lineHeight: 1.9, color: "#4c5a4f", margin: 0 };
