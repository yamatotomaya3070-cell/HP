// 修正ナレッジ（要望3）: 事業所からの返信で「何を直したいか」を一覧・集計する。
// アクセスは middleware の Basic 認証で保護（/admin 配下）。

import type { Metadata } from "next";
import Link from "next/link";
import { getEditKnowledge } from "@/server/admin/editKnowledge.js";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "修正ナレッジ",
};

const STATUS_LABEL: Record<string, string> = {
  received: "受付",
  applied: "反映",
  rejected: "変更なし",
  failed: "失敗",
};

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function KnowledgePage() {
  const { items, topEdits, total } = await getEditKnowledge();

  return (
    <main className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>修正ナレッジ</h1>
        <p className={styles.sub}>
          事業所からの返信＝「何を直してほしいか」の記録（全 {total} 件）。
          <Link href="/admin" style={{ marginLeft: "1rem" }}>
            ← ダッシュボードへ
          </Link>
        </p>
      </header>

      <h2 className={styles.sectionTitle}>よくある修正</h2>
      {topEdits.length === 0 ? (
        <p className={styles.empty}>まだ返信による修正はありません。</p>
      ) : (
        <div className={styles.tiles}>
          {topEdits.map((t) => (
            <div className={styles.tile} key={t.label}>
              <div className={styles.tileNum}>{t.count}</div>
              <div className={styles.tileLabel}>{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className={styles.sectionTitle}>返信の記録</h2>
      {items.length === 0 ? (
        <p className={styles.empty}>返信はまだありません。</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>日時</th>
                <th>事業所</th>
                <th>返信内容（事業所の言葉）</th>
                <th>修正項目</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(it.createdAt)}</td>
                  <td>
                    {it.facilityName}
                    {it.facilityNumber ? (
                      <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                        {it.facilityNumber}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ maxWidth: "34rem", whiteSpace: "pre-wrap" }}>
                    {it.rawInput}
                  </td>
                  <td>{it.opLabels.length ? it.opLabels.join("、") : "—"}</td>
                  <td>{STATUS_LABEL[it.status] ?? it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
