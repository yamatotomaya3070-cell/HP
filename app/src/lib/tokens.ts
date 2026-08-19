// 署名付き期限トークン（マジックリンク／メールReply-Toトークンの共通基盤）。
// 仕様9: 期限付き・推測不可・事業所専用。パスワード不要。
// 形式: base64url(payloadJSON).base64url(HMAC-SHA256)。鍵は TOKEN_SIGNING_SECRET。

import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenPurpose = "edit" | "reply" | "publish" | "unsubscribe";

interface TokenPayload {
  /** facility id */
  fid: string;
  /** 用途 */
  p: TokenPurpose;
  /** 失効時刻（epoch秒） */
  exp: number;
}

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
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadB64).digest());
}

/** 事業所専用トークンを発行する。ttlSeconds 既定7日。 */
export function issueToken(
  facilityId: string,
  purpose: TokenPurpose,
  ttlSeconds = 60 * 60 * 24 * 7,
): string {
  const payload: TokenPayload = {
    fid: facilityId,
    p: purpose,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export type VerifyResult =
  | { ok: true; facilityId: string; purpose: TokenPurpose }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** トークンを検証する。署名・期限・用途を確認。 */
export function verifyToken(token: string, expected: TokenPurpose): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sigB64] = parts;

  const expectedSig = sign(payloadB64);
  const a = fromB64url(sigB64);
  const b = fromB64url(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload.p !== expected) return { ok: false, reason: "malformed" };
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, facilityId: payload.fid, purpose: payload.p };
}
