// 配信停止（オプトアウト）リンクの生成と検証。
// 事業所専用の署名付きトークンを用い、推測不可・長期有効。実際の停止処理は API ルートで行う。

import { issueToken, verifyToken, type VerifyResult } from "@/lib/tokens.js";

/** 配信停止リンクは長期有効（受信者がいつでも解除できるように）。 */
const UNSUBSCRIBE_TTL_SECONDS = 400 * 24 * 60 * 60;

/** 事業所向けの配信停止URLを発行する。 */
export function buildUnsubscribeUrl(facilityId: string, baseUrl?: string): string {
  const base = baseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  const token = issueToken(facilityId, "unsubscribe", UNSUBSCRIBE_TTL_SECONDS);
  return `${base}/unsubscribe/${token}`;
}

/** 配信停止トークンを検証する。 */
export function verifyUnsubscribeToken(token: string): VerifyResult {
  return verifyToken(token, "unsubscribe");
}
