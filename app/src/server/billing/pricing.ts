// 料金体系（2026-09 改定）: 無料¥0 / 通常¥5,000 / 上級¥7,000。公開は月額に含む。
// DB や決済SDKに依存しない定数だけを置く（Stripe 実装・画面・状態機械から共通参照する）。

export const TRIAL_DAYS = 7;
export const MONTHLY_FEE = 5000; // 円（通常プラン月額・編集し放題＋公開）
export const MONTHLY_FEE_PRO = 7000; // 円（上級プラン月額・プロに相談できる）
export const PRO_EDIT_FEE = 10000; // 円（プロ編集の都度依頼。上級プランは8,000円）
export const PRO_EDIT_FEE_PRO_PLAN = 8000;
/** @deprecated 公開は月額に含むため廃止。過去の Payment レコード互換のために残す。 */
export const PUBLISH_FEE = 5000;
