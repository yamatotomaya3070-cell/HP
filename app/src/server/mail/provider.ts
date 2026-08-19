// メール送受信のプロバイダ抽象化（Resend/SendGrid/Postmark を後で差し込む）。
// 送信は個別送信のみ（CC/BCC禁止）。受信は署名検証してから正規化する。
// 実プロバイダ確定前でも全ロジックを作れるよう、開発用スタブを同梱。

import { createHmac, timingSafeEqual } from "node:crypto";
import { ResendMailProvider } from "./resendProvider.js";

/** 添付ファイル（例: プレビューHPのスクリーンショット）。content は base64 文字列。 */
export interface OutboundAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

export interface OutboundMessage {
  to: string;
  /** 事業所別 Reply-To（識別トークン入り）。 */
  replyTo: string;
  subject: string;
  text: string;
  /** 任意の添付（未指定なら添付なし）。 */
  attachments?: OutboundAttachment[];
}

export interface InboundMessage {
  from: string;
  /** 宛先（Reply-To トークンを含む reply+<token>@... を含む）。 */
  to: string[];
  subject?: string;
  text: string;
  messageId?: string;
}

export interface MailProvider {
  readonly name: string;
  /** 個別送信。CC/BCC は付けない。 */
  send(msg: OutboundMessage): Promise<{ messageId: string }>;
  /** Webフックの生ボディ＋ヘッダを検証し、正規化した受信メールを返す。不正なら throw。 */
  parseInbound(rawBody: string, headers: Record<string, string>): InboundMessage;
}

export class MailProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "bad_signature" | "bad_payload" | "send_failed",
  ) {
    super(message);
    this.name = "MailProviderError";
  }
}

/**
 * 開発用スタブ。送信はログ出力のみ。受信は JSON ボディを想定し、
 * MAIL_INBOUND_WEBHOOK_SECRET があれば x-inbound-signature(HMAC-SHA256 hex) を検証する。
 */
export class DevMailProvider implements MailProvider {
  readonly name = "dev";
  private readonly sink: (msg: OutboundMessage) => void;

  constructor(sink?: (msg: OutboundMessage) => void) {
    this.sink =
      sink ??
      ((m) => {
        const att = m.attachments?.length ? `\n添付: ${m.attachments.map((a) => a.filename).join(", ")}` : "";
        console.log(`[mail:dev] → ${m.to}\n件名: ${m.subject}\n${m.text}${att}\n`);
      });
  }

  async send(msg: OutboundMessage): Promise<{ messageId: string }> {
    this.sink(msg);
    return { messageId: `dev-${Date.now()}` };
  }

  parseInbound(rawBody: string, headers: Record<string, string>): InboundMessage {
    const secret = process.env.MAIL_INBOUND_WEBHOOK_SECRET;
    if (secret) {
      const sig = headers["x-inbound-signature"] ?? headers["X-Inbound-Signature"];
      if (!sig) throw new MailProviderError("署名ヘッダがありません", "bad_signature");
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new MailProviderError("署名が一致しません", "bad_signature");
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new MailProviderError("受信ボディがJSONではありません", "bad_payload");
    }
    return normalizeInbound(body);
  }
}

/** ゆるいペイロードを InboundMessage へ正規化する（プロバイダ差異を吸収）。 */
export function normalizeInbound(body: unknown): InboundMessage {
  const b = (body ?? {}) as Record<string, unknown>;
  const from = typeof b.from === "string" ? b.from : "";
  const toRaw = b.to;
  const to = Array.isArray(toRaw)
    ? toRaw.filter((x): x is string => typeof x === "string")
    : typeof toRaw === "string"
      ? [toRaw]
      : [];
  const text = typeof b.text === "string" ? b.text : "";
  if (!from || to.length === 0) {
    throw new MailProviderError("from/to が不足しています", "bad_payload");
  }
  return {
    from,
    to,
    text,
    subject: typeof b.subject === "string" ? b.subject : undefined,
    messageId: typeof b.messageId === "string" ? b.messageId : undefined,
  };
}

/**
 * 環境に応じてプロバイダを選ぶ。
 * MAIL_PROVIDER=resend かつ MAIL_API_KEY・MAIL_FROM があれば Resend、無ければ開発用スタブ。
 */
export function getMailProvider(): MailProvider {
  if (
    process.env.MAIL_PROVIDER === "resend" &&
    process.env.MAIL_API_KEY &&
    process.env.MAIL_FROM
  ) {
    return new ResendMailProvider({
      apiKey: process.env.MAIL_API_KEY,
      from: process.env.MAIL_FROM,
    });
  }
  return new DevMailProvider();
}
