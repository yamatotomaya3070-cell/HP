// Cloudflare Email Worker: fukushi-partner.com 宛の受信メールを解析し、
// 本番の受信Webhook(/api/mail/inbound)へ HMAC 署名付きで転送する。
// reply+<token>@fukushi-partner.com への返信を AI 編集ループに橋渡しする役割。
//
// 検証: 本文JSONに対する HMAC-SHA256(hex) を x-inbound-signature ヘッダで送る。
// サーバ側(DevMailProvider.parseInbound)が MAIL_INBOUND_WEBHOOK_SECRET で同じHMACを再計算し照合する。

import PostalMime from "postal-mime";

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {{ INBOUND_WEBHOOK_URL: string, MAIL_INBOUND_WEBHOOK_SECRET: string }} env
   */
  async email(message, env) {
    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch {
      parsed = { text: "", subject: "" };
    }

    const subject = parsed.subject || message.headers.get("subject") || "";
    // 返信本文はプレーンテキスト優先。無ければHTMLをタグ除去で最低限テキスト化。
    const text = parsed.text || stripHtml(parsed.html || "") || "";

    const body = JSON.stringify({
      from: message.from,
      to: [message.to],
      subject,
      text,
      messageId: message.headers.get("message-id") || undefined,
    });

    const signature = await hmacHex(env.MAIL_INBOUND_WEBHOOK_SECRET, body);

    const res = await fetch(env.INBOUND_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inbound-signature": signature,
      },
      body,
    });

    // Webhook が受理しなければログに残す（メールは破棄せず、必要なら再送設計へ）。
    if (!res.ok) {
      console.log(`inbound webhook failed: ${res.status} ${await res.text()}`);
    }
  },
};

/** 文字列の HMAC-SHA256 を16進で返す（Web Crypto）。 */
async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 最低限のHTML→テキスト（本文が text/plain を持たない場合のフォールバック）。 */
function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}
