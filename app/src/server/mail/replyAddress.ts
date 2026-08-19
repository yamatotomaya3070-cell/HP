// 事業所別 Reply-To アドレス（識別トークン入り）の生成と抽出。
// 形式: reply+<token>@<domain>。inbound の宛先からトークンを取り出し事業所を特定する。

import { issueToken } from "@/lib/tokens.js";

function replyDomain(): string {
  const d = process.env.MAIL_REPLY_DOMAIN;
  if (d) return d;
  try {
    return new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").hostname;
  } catch {
    return "localhost";
  }
}

/** 事業所向けの Reply-To を発行する（返信識別用トークン入り）。 */
export function buildReplyTo(facilityId: string, ttlDays = 30): string {
  const token = issueToken(facilityId, "reply", ttlDays * 24 * 60 * 60);
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
