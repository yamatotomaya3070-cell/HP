// 事業所別 Reply-To アドレス（識別トークン入り）の生成と検証。
// 形式: reply+<facilityId>.<exp36>.<sig>@<domain>。inbound の宛先からトークンを取り出し事業所を特定する。
//
// 設計上の制約（重要）: メールのローカル部（@ より前）は RFC 5321 で最大 64 文字。
// 汎用の issueToken（payloadJSON.HMAC）は 130 文字超になりこの上限を破るため、
// Reply-To 専用に「短い署名付きトークン」を用いる。cuid(25) + exp(base36) + 切詰HMAC で 56 文字に収める。
// ステートレス（DB不要・同期）を維持し、署名で偽造を防ぐ。

import { createHmac, timingSafeEqual } from "node:crypto";

/** 署名バイト数（切り詰め HMAC-SHA256）。12 バイト = base64url 16 文字。 */
const SIG_BYTES = 12;
/** Reply-To トークンの既定有効日数。 */
const DEFAULT_TTL_DAYS = 30;

function secret(): string {
  const s = process.env.TOKEN_SIGNING_SECRET;
  if (!s || s.length < 16) {
    throw new Error("TOKEN_SIGNING_SECRET が未設定/短すぎます（署名不可）");
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 署名対象文字列（facilityId.exp36）に対する切り詰め HMAC を返す。 */
function sign(body: string): string {
  const full = createHmac("sha256", secret()).update(body).digest();
  return b64url(full.subarray(0, SIG_BYTES));
}

function replyDomain(): string {
  const d = process.env.MAIL_REPLY_DOMAIN;
  if (d) return d;
  try {
    return new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").hostname;
  } catch {
    return "localhost";
  }
}

/** 事業所向けの Reply-To を発行する（返信識別用トークン入り・短縮形）。 */
export function buildReplyTo(facilityId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const body = `${facilityId}.${exp.toString(36)}`;
  const token = `${body}.${sign(body)}`;
  return `reply+${token}@${replyDomain()}`;
}

/** 受信メールの宛先群から reply+<token> のトークンを取り出す。 */
export function extractReplyToken(toAddresses: string[]): string | null {
  for (const addr of toAddresses) {
    // "Name <reply+TOKEN@domain>" 形式にも対応
    const m = addr.match(/reply\+([^@>\s]+)@/i);
    if (m) return m[1];
  }
  return null;
}

export type ReplyTokenResult =
  | { ok: true; facilityId: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** Reply-To トークンを検証し、事業所 ID を取り出す。署名・期限を確認。 */
export function verifyReplyToken(token: string): ReplyTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [facilityId, exp36, sig] = parts;
  if (!facilityId || !exp36 || !sig) return { ok: false, reason: "malformed" };

  const expected = sign(`${facilityId}.${exp36}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  const exp = parseInt(exp36, 36);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, facilityId };
}
