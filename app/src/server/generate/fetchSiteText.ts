// 事業所が申告した既存ホームページを実際に読みに行き、本文テキストを取り出す。
//
// なぜ必要か: これまでURLは researchFacility のプロンプトに文字列で添えるだけで、
// 実際のページは一度も取得していなかった。検索グラウンディング頼みでは、
// 検索に出てこないサイトの内容を取りこぼす。URLを教わっているなら直接読むのが確実。
//
// セキュリティ: URLは利用者（LINE）由来＝信用できない入力。SSRF対策として
// http/https限定・内部アドレス拒否・DNS解決後の再検証・リダイレクト各ホップの検証・
// タイムアウト・サイズ上限を課す。検証部分は純粋関数に分けてテストする。

import { lookup } from "node:dns/promises";

/** 取得サイズ上限（バイト）。大きなページで詰まらないように。 */
const MAX_BYTES = 1_500_000;
/** 1リクエストのタイムアウト（ms）。 */
const TIMEOUT_MS = 10_000;
/** 追跡するリダイレクトの最大数。 */
const MAX_REDIRECTS = 3;
/** 抽出テキストの上限文字数（プロンプトに載せる分）。 */
const MAX_TEXT_CHARS = 6000;

/** 入力URLを正規化する。スキーム無しは https を補う。http/https 以外と不正は null。 */
export function normalizeUrlInput(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;

  // TLD の無いホスト名は公開サイトではない。
  // 「なし」「おまかせ」等の日本語回答が punycode で有効ホスト名に化けるのを弾く意図もある。
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.includes(":");
  if (!isIpLiteral && !u.hostname.includes(".")) return null;

  return u.toString();
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, Number(m[2]), Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / クラウドのメタデータ
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // マルチキャスト/予約
  return false;
}

/** ループバック・内部ホスト名・プライベートIPか。 */
export function isPrivateHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;

  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return true;
  if (h === "metadata.google.internal") return true;

  // IPv6 ループバック / リンクローカル / ユニークローカル
  if (h === "::1" || h === "::" ) return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4射影アドレス
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  return isPrivateIpv4(h);
}

/** 取得してよいURLか（形式＋宛先の静的検証）。 */
export function isSafeFetchUrl(raw: string | null | undefined): boolean {
  const normalized = normalizeUrlInput(raw);
  if (!normalized) return false;
  return !isPrivateHost(new URL(normalized).hostname);
}

/** DNS解決結果まで含めて内部宛てでないか確認する。 */
async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateHost(r.address));
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** HTMLから本文テキストを抽出する（タグ除去・ブロック要素は改行）。 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|nav|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&[a-zA-Z#0-9]+;/g, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t　]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** レスポンス本文を上限付きで読む。 */
async function readCapped(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf).slice(0, MAX_BYTES);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * 既存サイトの本文テキストを取得する。
 * 取得できない場合は空文字（生成は続行可能＝握りつぶさずログに残す）。
 */
export async function fetchSiteText(rawUrl: string | null | undefined): Promise<string> {
  const start = normalizeUrlInput(rawUrl);
  if (!start) return "";
  let current: string = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = new URL(current);
    if (isPrivateHost(url.hostname)) {
      console.log(`サイト取得を中止（内部宛て）: ${url.hostname}`);
      return "";
    }
    if (!(await resolvesToPublicAddress(url.hostname))) {
      console.log(`サイト取得を中止（DNSが内部/解決不可）: ${url.hostname}`);
      return "";
    }

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // 事業所サイトに対して素性を明示する。
          "User-Agent": "kizuna-hp-bot/1.0 (+https://fukushi-partner.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (e) {
      console.log(`サイト取得に失敗: ${current} (${(e as Error).message})`);
      return "";
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      const next = location ? normalizeUrlInput(new URL(location, current).toString()) : null;
      if (!next) return "";
      current = next;
      continue;
    }
    if (!res.ok) {
      console.log(`サイト取得のステータス異常: ${current} → ${res.status}`);
      return "";
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      console.log(`サイト取得をスキップ（HTMLでない）: ${contentType}`);
      return "";
    }

    return htmlToText(await readCapped(res)).slice(0, MAX_TEXT_CHARS);
  }

  console.log(`サイト取得を中止（リダイレクト過多）: ${rawUrl}`);
  return "";
}
