// 管理ダッシュボード（仕様7）。都道府県別KPI・本命スコア・決済失敗一覧。
// アクセスは middleware の Basic 認証で保護。集計は server/admin/metrics。

import type { Metadata } from "next";
import { getDashboardData } from "@/server/admin/metrics.js";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "管理ダッシュボード",
};

const STATUS_LABEL: Record<string, string> = {
  imported: "取込",
  site_generated: "生成",
  email_sent: "送信",
  replied: "返信",
  free_edit_1: "編集1",
  free_edit_2: "編集2",
  free_edit_3: "編集3",
  card_registered: "カード",
  trialing: "体験中",
  published: "公開",
  subscribed: "契約",
  canceled: "解約",
  resubscribed: "再契約",
  suppressed: "停止",
  hot_lead: "本命",
};

// ファネルとして並べる行動ログ種別（開封のみは意図的に KPI から除外）。
const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: "site_generated", label: "生成" },
  { key: "email_sent", label: "送信" },
  { key: "email_replied", label: "返信" },
  { key: "ai_edit", label: "AI編集" },
  { key: "card_registered", label: "カード登録" },
  { key: "published", label: "公開" },
  { key: "subscribed", label: "契約" },
  { key: "canceled", label: "解約" },
  { key: "resubscribed", label: "再契約" },
  { key: "suppressed", label: "配信停止" },
];

const BAND_LABEL: Record<string, string> = { hot: "本命", warm: "見込み", cold: "低" };

export default async function AdminPage() {
  const { prefectureKpi, funnel, hotLeads, failedPayments, totalFacilities } =
    await getDashboardData();

  // KPI 表に出すステータス列（主要ステージのみ）。
  const kpiStatuses = [
    "imported",
    "site_generated",
    "replied",
    "card_registered",
    "published",
    "subscribed",
    "canceled",
  ];

  return (
    <main className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>管理ダッシュボード</h1>
        <p className={styles.sub}>登録事業所 {totalFacilities.toLocaleString()} 件</p>
      </header>

      <section aria-labelledby="funnel-h">
        <h2 id="funnel-h" className={styles.sectionTitle}>ファネル（行動ログ累計）</h2>
        <div className={styles.tiles}>
          {FUNNEL_STEPS.map((s) => (
            <div key={s.key} className={styles.tile}>
              <span className={styles.tileNum}>{(funnel[s.key] ?? 0).toLocaleString()}</span>
              <span className={styles.tileLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="hot-h">
        <h2 id="hot-h" className={styles.sectionTitle}>本命スコア 上位（開封のみは除外）</h2>
        {hotLeads.length === 0 ? (
          <p className={styles.empty}>スコア対象の行動がまだありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>事業所</th>
                  <th>都道府県</th>
                  <th>ステージ</th>
                  <th className={styles.num}>スコア</th>
                  <th>区分</th>
                </tr>
              </thead>
              <tbody>
                {hotLeads.map((h) => (
                  <tr key={h.facilityId}>
                    <td>{h.name}</td>
                    <td>{h.prefecture ?? "-"}</td>
                    <td>{STATUS_LABEL[h.status] ?? h.status}</td>
                    <td className={styles.num}>{h.score}</td>
                    <td>
                      <span className={`${styles.band} ${styles[h.band]}`}>
                        {BAND_LABEL[h.band]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="kpi-h">
        <h2 id="kpi-h" className={styles.sectionTitle}>都道府県別KPI</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>都道府県</th>
                <th className={styles.num}>合計</th>
                {kpiStatuses.map((s) => (
                  <th key={s} className={styles.num}>{STATUS_LABEL[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prefectureKpi.map((p) => (
                <tr key={p.prefecture}>
                  <td>{p.prefecture}</td>
                  <td className={styles.num}>{p.total.toLocaleString()}</td>
                  {kpiStatuses.map((s) => (
                    <td key={s} className={styles.num}>{p.byStatus[s] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="fail-h">
        <h2 id="fail-h" className={styles.sectionTitle}>決済失敗</h2>
        {failedPayments.length === 0 ? (
          <p className={styles.empty}>決済失敗はありません。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>事業所</th>
                  <th>種別</th>
                  <th className={styles.num}>金額</th>
                  <th>日時</th>
                </tr>
              </thead>
              <tbody>
                {failedPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.facilityName}</td>
                    <td>{p.kind === "publish_5000" ? "公開(5,000円)" : "月額"}</td>
                    <td className={styles.num}>{p.amount.toLocaleString()}円</td>
                    <td>{new Date(p.createdAt).toLocaleString("ja-JP")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
