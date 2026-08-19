// Resend 実装（MailProvider の差込口）。送信は Resend API、受信は Svix 署名検証 → 正規化。
// 送信は個別送信のみ（to は単一・CC/BCC なし）。実キー確定後に getMailProvider() が本実装を返す。
// ※ 実エンドポイントでの疎通は未検証。実キー投入後にテスト送信（campaign-send --test-to）で確認すること。

import { Resend } from "resend";
import { Webhook } from "svix";
import {
  type MailProvider,
  type OutboundMessage,
  type InboundMessage,
  MailProviderError,
  normalizeInbound,
} from "./provider.js";

export interface ResendConfig {
  apiKey: string;
  /** 送信元アドレス（認証済みドメイン）。例: "絆 <noreply@kizuna.example>"。 */
  from: string;
}

export class ResendMailProvider implements MailProvider {
  readonly name = "resend";
  private readonly client: Resend;
  private readonly from: string;

  constructor(config: ResendConfig) {
    this.client = new Resend(config.apiKey);
    this.from = config.from;
  }

  async send(msg: OutboundMessage): Promise<{ messageId: string }> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: msg.to, // 単一宛先＝個別送信
      replyTo: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
      attachments: msg.attachments?.map((a) => ({
        filename: a.filename,
        content: a.contentBase64,
      })),
    });
    if (error) {
      throw new MailProviderError(`Resend 送信失敗: ${error.message}`, "send_failed");
    }
    return { messageId: data?.id ?? `resend-${Date.now()}` };
  }

  parseInbound(rawBody: string, headers: Record<string, string>): InboundMessage {
    const secret = process.env.MAIL_INBOUND_WEBHOOK_SECRET;
    if (secret) {
      try {
        const wh = new Webhook(secret);
        wh.verify(rawBody, {
          "svix-id": headers["svix-id"] ?? "",
          "svix-timestamp": headers["svix-timestamp"] ?? "",
          "svix-signature": headers["svix-signature"] ?? "",
        });
      } catch {
        throw new MailProviderError("Resend 署名が一致しません", "bad_signature");
      }
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new MailProviderError("受信ボディがJSONではありません", "bad_payload");
    }
    // Resend の inbound は { type, data: {...} } 形。data 側を正規化対象にする。
    const inner = (body as { data?: unknown } | null)?.data ?? body;
    return normalizeInbound(inner);
  }
}
