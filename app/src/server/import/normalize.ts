// 取込レコードの正規化と重複判定キー生成（純粋関数・DB非依存＝テスト容易）。
// 仕様: 法人名・事業所名・電話番号・所在地・メールアドレスで重複判定する。
// 第一キーは WAM NET の事業所番号（facilityNumber）。補助として正規化複合キー。

/** WAM NET 収集JSONの1レコード（results/<県>/<県>_emails.json）。 */
export interface RawFacilityRecord {
  facilityNumber?: string;
  name?: string;
  corpName?: string;
  address?: string;
  tel?: string;
  fax?: string;
  url?: string;
  email?: string;
  status?: string; // ok / no_email_listed / error:...
}

/** 正規化済みの取込レコード。DB投入前の中間表現。 */
export interface NormalizedFacility {
  facilityNumber: string | null;
  name: string;
  corpName: string | null;
  address: string | null;
  prefecture: string | null;
  tel: string | null;
  fax: string | null;
  url: string | null;
  email: string | null;
  emailStatus: "ok" | "no_email_listed" | "error" | "unknown";
  dedupKey: string;
}

/**
 * テキスト正規化: NFKC（全角→半角等）、前後空白除去、内部空白を全除去、英字は小文字化。
 * 全角/半角・スペース有無の揺れを吸収して重複判定の精度を上げる。
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

/** 電話/FAX正規化: NFKC後に数字のみを残す。区切りや全角の揺れを吸収。 */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.normalize("NFKC").replace(/[^0-9]/g, "");
}

/** メール正規化: trim + 小文字化。空や不正形式は null。 */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(v)) return null;
  return v;
}

function mapEmailStatus(status: string | undefined): NormalizedFacility["emailStatus"] {
  if (!status) return "unknown";
  if (status === "ok") return "ok";
  if (status === "no_email_listed") return "no_email_listed";
  if (status.startsWith("error")) return "error";
  return "unknown";
}

/**
 * 正規化複合キー: 法人名 + 事業所名 + 電話 + 所在地。
 * 事業所番号が無い/欠損レコードでも重複を検出できるようにする補助キー。
 */
export function buildDedupKey(rec: RawFacilityRecord): string {
  return [
    normalizeText(rec.corpName),
    normalizeText(rec.name),
    normalizePhone(rec.tel),
    normalizeText(rec.address),
  ].join("|");
}

/** 生レコードを正規化中間表現へ変換。prefecture は呼び出し側で付与できる。 */
export function normalizeRecord(
  rec: RawFacilityRecord,
  prefecture: string | null = null,
): NormalizedFacility {
  const name = (rec.name ?? "").normalize("NFKC").trim();
  return {
    facilityNumber: rec.facilityNumber?.trim() || null,
    name,
    corpName: rec.corpName?.normalize("NFKC").trim() || null,
    address: rec.address?.normalize("NFKC").trim() || null,
    prefecture,
    tel: rec.tel?.normalize("NFKC").trim() || null,
    fax: rec.fax?.normalize("NFKC").trim() || null,
    url: rec.url?.trim() || null,
    email: normalizeEmail(rec.email),
    emailStatus: mapEmailStatus(rec.status),
    dedupKey: buildDedupKey(rec),
  };
}
