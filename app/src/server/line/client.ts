// LINE Messaging API クライアント（送信）と Webhook 署名検証。
// env: LINE_CHANNEL_ACCESS_TOKEN（送信）, LINE_CHANNEL_SECRET（署名検証）。
// メール/画像と同じ env ゲート方式。未設定なら isLineConfigured() が false。

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.line.me/v2/bot";

export function isLineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET);
}

/** Webhook 署名（x-line-signature）を検証する。rawBody は生の文字列。 */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface LineMessage {
  type: "text";
  text: string;
}

/** テキストメッセージを返信する（reply token 使用・無料・推奨）。 */
export async function replyText(replyToken: string, texts: string[]): Promise<void> {
  await callApi("/message/reply", {
    replyToken,
    messages: texts.slice(0, 5).map((t) => ({ type: "text", text: t.slice(0, 4900) })),
  });
}

/** 任意メッセージを返信する（テキスト以外も渡せる）。 */
export async function replyMessages(replyToken: string, messages: unknown[]): Promise<void> {
  await callApi("/message/reply", { replyToken, messages: messages.slice(0, 5) });
}

/** userId 宛にプッシュ送信する（reply token が無い/期限切れ時）。 */
export async function pushText(to: string, texts: string[]): Promise<void> {
  await callApi("/message/push", {
    to,
    messages: texts.slice(0, 5).map((t) => ({ type: "text", text: t.slice(0, 4900) })),
  });
}

/** ユーザープロフィール（表示名など）を取得する。失敗時は null。 */
export async function getProfile(
  userId: string,
): Promise<{ displayName?: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API}/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as { displayName?: string };
  } catch {
    return null;
  }
}

/** LINEが受信した画像コンテンツのバイト列を取得する（messageId 指定）。 */
export async function getMessageContent(messageId: string): Promise<Uint8Array | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function callApi(path: string, body: unknown): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN 未設定");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`LINE API ${path} 失敗: ${res.status} ${text}`);
  }
}

export type { LineMessage };
