// バッチ内の重複統合（純粋・DB非依存）。取込ファイル自体に含まれる重複を防ぐ。
// 同一事業所番号／複合キー／メールのいずれかで一致したら同一とみなす。

import type { NormalizedFacility } from "./normalize.js";

/** レコードの一致キー候補（優先順）。最初に一致した既知キーで同一判定する。 */
export function identityKeys(rec: NormalizedFacility): string[] {
  const keys: string[] = [];
  if (rec.facilityNumber) keys.push(`fn:${rec.facilityNumber}`);
  if (rec.dedupKey && rec.dedupKey.replace(/\|/g, "").length > 0) {
    keys.push(`dk:${rec.dedupKey}`);
  }
  if (rec.email) keys.push(`em:${rec.email}`);
  return keys;
}

/** 後勝ちで欠損を補完しつつ2件を統合（非破壊：新オブジェクトを返す）。 */
function mergeRecords(
  base: NormalizedFacility,
  next: NormalizedFacility,
): NormalizedFacility {
  return {
    facilityNumber: base.facilityNumber ?? next.facilityNumber,
    name: next.name || base.name,
    corpName: base.corpName ?? next.corpName,
    address: base.address ?? next.address,
    prefecture: base.prefecture ?? next.prefecture,
    tel: base.tel ?? next.tel,
    fax: base.fax ?? next.fax,
    url: base.url ?? next.url,
    // メールは取得成功(ok)を優先
    email: base.emailStatus === "ok" ? base.email : (next.email ?? base.email),
    emailStatus: base.emailStatus === "ok" ? base.emailStatus : next.emailStatus,
    dedupKey: base.dedupKey || next.dedupKey,
  };
}

export interface DedupeResult {
  unique: NormalizedFacility[];
  duplicatesRemoved: number;
}

/**
 * バッチ内重複を統合する。どのキーでも一致しないものだけが新規レコードになる。
 */
export function dedupeBatch(records: NormalizedFacility[]): DedupeResult {
  const byKey = new Map<string, number>(); // identityKey -> unique[] index
  const unique: NormalizedFacility[] = [];
  let duplicatesRemoved = 0;

  for (const rec of records) {
    const keys = identityKeys(rec);
    let matchedIndex = -1;
    for (const k of keys) {
      const idx = byKey.get(k);
      if (idx !== undefined) {
        matchedIndex = idx;
        break;
      }
    }

    if (matchedIndex >= 0) {
      unique[matchedIndex] = mergeRecords(unique[matchedIndex], rec);
      duplicatesRemoved += 1;
      // 統合後レコードの全キーを張り直す（新たに埋まったキーも登録）
      for (const k of identityKeys(unique[matchedIndex])) {
        byKey.set(k, matchedIndex);
      }
    } else {
      const idx = unique.length;
      unique.push(rec);
      for (const k of keys) byKey.set(k, idx);
    }
  }

  return { unique, duplicatesRemoved };
}
