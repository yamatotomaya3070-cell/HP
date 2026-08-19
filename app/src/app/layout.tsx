import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "就労継続支援B型 事業所ホームページ",
  description: "就労継続支援B型事業所のホームページ",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
