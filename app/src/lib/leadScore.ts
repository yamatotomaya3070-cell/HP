// 本命（見込み度）スコアの重み付け（仕様7）。返信・編集・カード・公開・契約を重視し、
// 「開封のみ」は加点しない（開封は意思表示として弱いため除外）。純関数＝テスト可能・DB非依存。

export const HOT_WEIGHTS: Record<string, number> = {
  email_opened: 0, // 開封のみは除外（0点）
  email_replied: 3,
  ai_edit: 4,
  info_updated: 1,
  photo_registered: 2,
  card_registered: 6,
  published: 8,
  subscribed: 10,
  resubscribed: 5,
  // 以下は減点（離脱シグナル）
  canceled: -4,
  suppressed: -8,
};

/** イベント種別の列からスコアを合算する。未知の種別は0点。 */
export function scoreEvents(types: readonly string[]): number {
  return types.reduce((sum, t) => sum + (HOT_WEIGHTS[t] ?? 0), 0);
}

/** スコアの区分ラベル（表示用）。 */
export function hotBand(score: number): "hot" | "warm" | "cold" {
  if (score >= 10) return "hot";
  if (score >= 4) return "warm";
  return "cold";
}
