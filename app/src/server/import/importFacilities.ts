// 取込エンジン: ソース読込 → 正規化 → バッチ内重複統合 → 既存重複判定 → upsert → 履歴記録。
// 仕様: 二重登録を防ぐ。第一キー facilityNumber、補助キー 正規化複合キー / メール。

import { prisma } from "@/lib/db.js";
import { prefectureOfAddress } from "@/lib/prefectures.js";
import { loadSources } from "./readSources.js";
import { normalizeRecord, type NormalizedFacility } from "./normalize.js";
import { dedupeBatch } from "./dedup.js";

export interface ImportSummary {
  source: string;
  totalRows: number;
  inserted: number;
  updated: number;
  duplicatesInFile: number;
  errors: { label: string; reason: string }[];
}

/** dedupKey が実質空（全項目欠損）かどうか。空キーでの誤マッチを防ぐ。 */
function hasUsableDedupKey(rec: NormalizedFacility): boolean {
  return rec.dedupKey.replace(/\|/g, "").length > 0;
}

/** 既存事業所を facilityNumber / dedupKey / email のいずれかで探す。 */
async function findExisting(rec: NormalizedFacility) {
  const or: Record<string, unknown>[] = [];
  if (rec.facilityNumber) or.push({ facilityNumber: rec.facilityNumber });
  if (hasUsableDedupKey(rec)) or.push({ dedupKey: rec.dedupKey });
  if (rec.email) or.push({ email: rec.email });
  if (or.length === 0) return null;
  return prisma.facility.findFirst({ where: { OR: or } });
}

/** 既存レコードへ欠損補完（非破壊的に差分だけ更新）。 */
function fillMissing(existing: {
  corpName: string | null; address: string | null; prefecture: string | null;
  tel: string | null; fax: string | null; url: string | null;
  email: string | null; facilityNumber: string | null;
}, rec: NormalizedFacility) {
  const data: Record<string, unknown> = {};
  if (!existing.facilityNumber && rec.facilityNumber) data.facilityNumber = rec.facilityNumber;
  if (!existing.corpName && rec.corpName) data.corpName = rec.corpName;
  if (!existing.address && rec.address) data.address = rec.address;
  if (!existing.prefecture && rec.prefecture) data.prefecture = rec.prefecture;
  if (!existing.tel && rec.tel) data.tel = rec.tel;
  if (!existing.fax && rec.fax) data.fax = rec.fax;
  if (!existing.url && rec.url) data.url = rec.url;
  if (!existing.email && rec.email) {
    data.email = rec.email;
    data.emailStatus = rec.emailStatus;
  }
  return data;
}

/** 1ファイル分を取込む。 */
async function importOneSource(
  label: string,
  rawRecords: { facilityNumber?: string; name?: string; corpName?: string; address?: string; tel?: string; fax?: string; url?: string; email?: string; status?: string }[],
  sourceUrl: string | null,
): Promise<ImportSummary> {
  const normalized = rawRecords
    .map((r) => normalizeRecord(r, prefectureOfAddress(r.address)))
    .filter((r) => r.name.length > 0); // 名称なしは取込対象外

  const { unique, duplicatesRemoved } = dedupeBatch(normalized);

  const importRow = await prisma.facilityImport.create({
    data: {
      source: label,
      prefecture: unique[0]?.prefecture ?? null,
      totalRows: rawRecords.length,
    },
  });

  let inserted = 0;
  let updated = 0;
  const errors: { label: string; reason: string }[] = [];

  for (const rec of unique) {
    try {
      const existing = await findExisting(rec);
      if (existing) {
        const patch = fillMissing(existing, rec);
        if (Object.keys(patch).length > 0) {
          await prisma.facility.update({ where: { id: existing.id }, data: patch });
        }
        updated += 1;
      } else {
        const created = await prisma.facility.create({
          data: {
            facilityNumber: rec.facilityNumber,
            name: rec.name,
            corpName: rec.corpName,
            address: rec.address,
            prefecture: rec.prefecture,
            tel: rec.tel,
            fax: rec.fax,
            url: rec.url,
            email: rec.email,
            emailStatus: rec.emailStatus,
            dedupKey: rec.dedupKey,
            sourceUrl,
            lastCheckedAt: new Date(),
            status: "imported",
            importId: importRow.id,
          },
        });
        inserted += 1;
        // 行動ログ（取込）＋監査ログ。エラーは握りつぶさない。
        await prisma.leadEvent.create({
          data: { facilityId: created.id, type: "imported", meta: { source: label } },
        });
      }
    } catch (e) {
      errors.push({ label: rec.name, reason: (e as Error).message });
    }
  }

  await prisma.facilityImport.update({
    where: { id: importRow.id },
    data: {
      insertedCount: inserted,
      updatedCount: updated,
      skippedCount: duplicatesRemoved,
      errorCount: errors.length,
      errors: errors.length ? errors : undefined,
    },
  });

  return {
    source: label,
    totalRows: rawRecords.length,
    inserted,
    updated,
    duplicatesInFile: duplicatesRemoved,
    errors,
  };
}

export interface ImportOptions {
  /** 出典URL（出典明記用）。WAM NET を既定にできる。 */
  sourceUrl?: string | null;
  /** 進捗コールバック。 */
  onProgress?: (summary: ImportSummary) => void;
}

export interface ImportResult {
  summaries: ImportSummary[];
  /** 読み飛ばしたファイル（メタJSON・読込失敗）。 */
  skipped: { path: string; reason: string }[];
}

/** パス（ファイル or ディレクトリ）を取込む。 */
export async function importFromPath(
  path: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { sources, skipped } = loadSources(path);
  const summaries: ImportSummary[] = [];
  for (const src of sources) {
    const summary = await importOneSource(
      src.label,
      src.records,
      options.sourceUrl ?? "https://www.wam.go.jp/sfkohyoout/",
    );
    summaries.push(summary);
    options.onProgress?.(summary);
  }
  return { summaries, skipped };
}
