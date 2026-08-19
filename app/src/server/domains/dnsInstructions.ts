// 事業所が独自ドメインを公開に使うための DNS 設定手順を生成する（純関数・外部依存なし）。
// apex（example.jp）は A レコード、サブドメイン（www.example.jp）は CNAME を案内する。
// 参照先は Vercel の標準値。プロジェクト側でドメインを登録後、事業所がこの通り設定する。

/** Vercel の apex 用 A レコードの向き先。 */
export const VERCEL_A_RECORD = "76.76.21.21";
/** Vercel の CNAME 用の向き先。 */
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

export interface DnsRecord {
  type: "A" | "CNAME";
  /** レコード名（apex は "@"、サブドメインはラベル）。 */
  name: string;
  value: string;
}

export interface DnsInstruction {
  domain: string;
  isApex: boolean;
  records: DnsRecord[];
  /** 事業所向けの平易な説明。 */
  note: string;
}

/** apex ドメイン（サブドメインを持たない）かどうかを判定する。 */
export function isApexDomain(domain: string): boolean {
  const host = normalizeDomain(domain);
  // ラベル数が2（example.jp）なら apex。3以上（www.example.jp）はサブドメイン。
  // 注: co.jp 等の二段 TLD は apex でもラベル3になるため、必要に応じて登録側で調整する。
  return host.split(".").length <= 2;
}

/** ドメイン文字列を正規化する（前後空白・末尾ドット・大文字・スキームを除去）。 */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  d = d.replace(/\.$/, "");
  return d;
}

/** 独自ドメインの DNS 設定手順を組み立てる。 */
export function buildDnsInstruction(domainInput: string): DnsInstruction {
  const domain = normalizeDomain(domainInput);
  const apex = isApexDomain(domain);

  if (apex) {
    return {
      domain,
      isApex: true,
      records: [{ type: "A", name: "@", value: VERCEL_A_RECORD }],
      note: `ドメイン「${domain}」の DNS に、次の A レコードを1件追加してください。設定の反映には最大で数時間かかる場合があります。`,
    };
  }

  const label = domain.split(".")[0];
  return {
    domain,
    isApex: false,
    records: [{ type: "CNAME", name: label, value: VERCEL_CNAME_TARGET }],
    note: `ドメイン「${domain}」の DNS に、次の CNAME レコードを1件追加してください。設定の反映には最大で数時間かかる場合があります。`,
  };
}
