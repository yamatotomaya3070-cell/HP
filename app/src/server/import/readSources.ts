// 取込ソースの読み込み。WAM NET 収集資産（読み取り専用）を入力として扱う。
// 対応: (a) 県別 *_emails.json / 分割 <県>.json、(b) それらを含むディレクトリ、
//       (c) WAM オープンデータ CSV（csvdownload046.csv, メール列なし）。
// xlsx は Phase 1 では未対応（依存を増やさないため。JSON/CSV で全件取込可能）。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import type { RawFacilityRecord } from "./normalize.js";

/** BOM を除去して文字列を返す。 */
function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/** JSON ファイルを読む。配列でなければ null（＝事業所リストではないメタファイル）。 */
export function readJsonFile(path: string): RawFacilityRecord[] | null {
  const raw = stripBom(readFileSync(path, "utf8"));
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) return null;
  return data as RawFacilityRecord[];
}

/** 1行を CSV フィールド配列へ。ダブルクォート囲み・エスケープ("")対応。 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** WAM オープンデータ CSV をヘッダ名で列マッピングして読む。 */
export function readWamCsv(path: string): RawFacilityRecord[] {
  const raw = stripBom(readFileSync(path, "utf8"));
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h === name);

  const idxNo = col("事業所番号");
  const idxName = col("事業所の名称");
  const idxCorp = col("法人の名称");
  const idxAddr1 = col("事業所住所（市区町村）");
  const idxAddr2 = col("事業所住所（番地以降）");
  const idxTel = col("事業所電話番号");
  const idxFax = col("事業所FAX番号");
  const idxUrl = col("事業所URL");

  const at = (fields: string[], i: number) => (i >= 0 ? (fields[i] ?? "").trim() : "");

  const records: RawFacilityRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const name = at(f, idxName);
    if (!name) continue; // 名称なし行はスキップ
    const address = `${at(f, idxAddr1)}${at(f, idxAddr2)}`.trim();
    records.push({
      facilityNumber: at(f, idxNo) || undefined,
      name,
      corpName: at(f, idxCorp) || undefined,
      address: address || undefined,
      tel: at(f, idxTel) || undefined,
      fax: at(f, idxFax) || undefined,
      url: at(f, idxUrl) || undefined,
    });
  }
  return records;
}

export interface LoadedSource {
  label: string; // 取込元の表示名（ファイル名/相対）
  records: RawFacilityRecord[];
}

export interface LoadResult {
  sources: LoadedSource[];
  /** 読み飛ばしたファイル（メタJSON・読込失敗）。握りつぶさず記録する。 */
  skipped: { path: string; reason: string }[];
}

/**
 * パス（ファイル or ディレクトリ）から取込対象を収集。ディレクトリは再帰探索。
 * 事業所リストでないJSONや読込失敗は skipped に記録して継続（1ファイルの不備で全体を止めない）。
 */
export function loadSources(path: string): LoadResult {
  const sources: LoadedSource[] = [];
  const skipped: { path: string; reason: string }[] = [];

  const consume = (full: string, label: string) => {
    try {
      const records = readFile(full);
      if (records === null) {
        skipped.push({ path: full, reason: "事業所リストではないJSON（メタファイル）" });
        return;
      }
      sources.push({ label, records });
    } catch (e) {
      skipped.push({ path: full, reason: (e as Error).message });
    }
  };

  const st = statSync(path);
  if (st.isFile()) {
    consume(path, basename(path));
    return { sources, skipped };
  }

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (isSupported(full)) consume(full, entry);
    }
  };
  walk(path);
  return { sources, skipped };
}

function isSupported(path: string): boolean {
  const ext = extname(path).toLowerCase();
  // .json（県別/emails付き）と .csv を対象。重複はバッチ内 dedup が統合する。
  return ext === ".json" || ext === ".csv";
}

function readFile(path: string): RawFacilityRecord[] | null {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return readJsonFile(path);
  if (ext === ".csv") return readWamCsv(path);
  throw new Error(`未対応の取込形式です: ${path}`);
}
