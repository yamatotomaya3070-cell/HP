// 決済プロバイダ抽象化（Stripe を後で差し込む）。カードは自社非保存。
// Checkout(カード登録/公開決済) と Webhook(署名検証→正規化) を抽象化。
// 実プロバイダ確定前でも状態機械を作り検証できるよう、開発用スタブを同梱。

import { createHmac, timingSafeEqual } from "node:crypto";
import { StripePaymentProvider } from "./stripeProvider.js";

/** 契約プラン。standard=通常プラン(¥5,000) / pro=上級プラン(¥7,000)。 */
export type SubscriptionPlan = "standard" | "pro";

export interface TrialCheckoutInput {
  facilityId: string;
  email?: string;
  plan: SubscriptionPlan;
}
export interface PublishCheckoutInput {
  facilityId: string;
  amount: number; // 円
}
export interface CheckoutResult {
  /** 事業所を誘導する決済URL（スタブはダミー）。 */
  url: string;
  /** 決済参照（プロバイダ側ID相当）。 */
  ref: string;
}

/** Webhook を正規化したイベント。冪等キー eventId 必須。 */
export type PaymentEvent =
  | {
      type: "trial_started";
      eventId: string;
      facilityId: string;
      customerId?: string;
      subscriptionId?: string;
      plan: SubscriptionPlan;
    }
  | { type: "payment_succeeded"; eventId: string; facilityId: string; kind: "publish_5000" | "subscription"; amount: number }
  | { type: "payment_failed"; eventId: string; facilityId: string; kind: "publish_5000" | "subscription"; amount: number }
  | { type: "subscription_canceled"; eventId: string; facilityId: string }
  | { type: "subscription_resumed"; eventId: string; facilityId: string; subscriptionId?: string }
  /** 状態を変えないイベント（0円請求書・重複通知・未対応種別）。200で受け取り再送を止める。 */
  | { type: "ignored"; eventId: string; reason: string };

export class PaymentProviderError extends Error {
  constructor(message: string, readonly kind: "bad_signature" | "bad_payload") {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  readonly name: string;
  createTrialCheckout(input: TrialCheckoutInput): Promise<CheckoutResult>;
  createPublishCheckout(input: PublishCheckoutInput): Promise<CheckoutResult>;
  parseWebhook(rawBody: string, headers: Record<string, string>): PaymentEvent;
}

/** 開発用スタブ。Checkoutはダミー、Webhookは JSON を検証して正規化。 */
export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async createTrialCheckout(input: TrialCheckoutInput): Promise<CheckoutResult> {
    return { url: `https://checkout.example/stub/trial/${input.facilityId}`, ref: `stub-trial-${Date.now()}` };
  }
  async createPublishCheckout(input: PublishCheckoutInput): Promise<CheckoutResult> {
    return { url: `https://checkout.example/stub/publish/${input.facilityId}`, ref: `stub-pub-${Date.now()}` };
  }

  parseWebhook(rawBody: string, headers: Record<string, string>): PaymentEvent {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (secret) {
      const sig = headers["x-payment-signature"] ?? headers["X-Payment-Signature"];
      if (!sig) throw new PaymentProviderError("署名ヘッダがありません", "bad_signature");
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new PaymentProviderError("署名が一致しません", "bad_signature");
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new PaymentProviderError("WebhookボディがJSONではありません", "bad_payload");
    }
    return normalizePaymentEvent(body);
  }
}

/** ゆるいペイロードを PaymentEvent へ正規化。 */
export function normalizePaymentEvent(body: unknown): PaymentEvent {
  const b = (body ?? {}) as Record<string, unknown>;
  const type = b.type;
  const eventId = typeof b.eventId === "string" ? b.eventId : "";
  const facilityId = typeof b.facilityId === "string" ? b.facilityId : "";
  if (!eventId || !facilityId) {
    throw new PaymentProviderError("eventId/facilityId が不足", "bad_payload");
  }
  switch (type) {
    case "trial_started":
      return {
        type,
        eventId,
        facilityId,
        customerId: typeof b.customerId === "string" ? b.customerId : undefined,
        subscriptionId: typeof b.subscriptionId === "string" ? b.subscriptionId : undefined,
        // 不正な値は standard 扱い（未知の文字列で処理を止めない）。
        plan: b.plan === "pro" ? "pro" : "standard",
      };
    case "payment_succeeded":
    case "payment_failed": {
      const kind = b.kind === "subscription" ? "subscription" : "publish_5000";
      const amount = typeof b.amount === "number" ? b.amount : kind === "publish_5000" ? 5000 : 4000;
      return { type, eventId, facilityId, kind, amount };
    }
    case "subscription_canceled":
      return { type, eventId, facilityId };
    case "subscription_resumed":
      return {
        type,
        eventId,
        facilityId,
        subscriptionId: typeof b.subscriptionId === "string" ? b.subscriptionId : undefined,
      };
    default:
      throw new PaymentProviderError(`未知のイベント種別: ${String(type)}`, "bad_payload");
  }
}

/**
 * 環境に応じて決済プロバイダを選ぶ。
 * STRIPE_SECRET_KEY と必須設定があれば Stripe、無ければ開発用スタブ。
 */
export function getPaymentProvider(): PaymentProvider {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const subscriptionPriceId = process.env.STRIPE_PRICE_SUBSCRIPTION;
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (secretKey && subscriptionPriceId) {
    return new StripePaymentProvider({
      secretKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      subscriptionPriceId,
      // 未設定でもよい（上級プランのCheckoutだけが使えない状態になる）。
      subscriptionPriceIdPro: process.env.STRIPE_PRICE_SUBSCRIPTION_PRO || undefined,
      successUrl: process.env.STRIPE_SUCCESS_URL ?? `${base}/billing/success`,
      cancelUrl: process.env.STRIPE_CANCEL_URL ?? `${base}/billing/cancel`,
    });
  }
  return new StubPaymentProvider();
}
