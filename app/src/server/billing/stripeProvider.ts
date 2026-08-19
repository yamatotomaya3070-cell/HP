// Stripe 実装（PaymentProvider の差込口）。Checkout（カード登録/公開決済）と Webhook 署名検証。
// カードは自社非保存（Stripe が保持）。実キー確定後に getPaymentProvider() が本実装を返す。
// ※ 実エンドポイントでの疎通・イベント経路は未検証。実キー投入後に Stripe のテストモードで要確認。
//   特に invoice/subscription 系イベントの facilityId は subscription_data.metadata 経由で伝播させている。

import Stripe from "stripe";
import {
  type PaymentProvider,
  type TrialCheckoutInput,
  type PublishCheckoutInput,
  type CheckoutResult,
  type PaymentEvent,
  PaymentProviderError,
} from "./provider.js";

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
  /** 月額サブスクの Price ID（Stripe ダッシュボードで作成）。 */
  subscriptionPriceId: string;
  /** 決済完了後の戻り先。 */
  successUrl: string;
  cancelUrl: string;
  /** 公開決済の金額（円）。既定 5000。 */
  publishAmount?: number;
  /** トライアル日数。既定 14。 */
  trialDays?: number;
}

/** Stripe オブジェクトの metadata から facilityId を取り出す。 */
function facilityIdFrom(metadata: Stripe.Metadata | null | undefined): string | undefined {
  const v = metadata?.facilityId;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Invoice から facilityId を取り出す。invoice 自体の metadata → 紐づくサブスクの metadata の順。
 * ※ API バージョンによりサブスク metadata の格納場所が異なるため緩く探索する（実ペイロードで要検証）。
 */
function facilityIdFromInvoice(inv: Stripe.Invoice): string | undefined {
  const direct = facilityIdFrom(inv.metadata);
  if (direct) return direct;
  const loose = inv as unknown as { subscription_details?: { metadata?: Stripe.Metadata } };
  return facilityIdFrom(loose.subscription_details?.metadata);
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  private readonly stripe: Stripe;

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey);
  }

  async createTrialCheckout(input: TrialCheckoutInput): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.config.subscriptionPriceId, quantity: 1 }],
      customer_email: input.email,
      subscription_data: {
        trial_period_days: this.config.trialDays ?? 14,
        metadata: { facilityId: input.facilityId },
      },
      metadata: { facilityId: input.facilityId },
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
    });
    return { url: session.url ?? "", ref: session.id };
  }

  async createPublishCheckout(input: PublishCheckoutInput): Promise<CheckoutResult> {
    const amount = input.amount || this.config.publishAmount || 5000;
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy", // 円は最小単位＝1円（×100 しない）
            unit_amount: amount,
            product_data: { name: "ホームページ正式公開" },
          },
        },
      ],
      metadata: { facilityId: input.facilityId, kind: "publish_5000" },
      payment_intent_data: { metadata: { facilityId: input.facilityId, kind: "publish_5000" } },
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
    });
    return { url: session.url ?? "", ref: session.id };
  }

  parseWebhook(rawBody: string, headers: Record<string, string>): PaymentEvent {
    const sig = headers["stripe-signature"] ?? headers["Stripe-Signature"];
    if (!this.config.webhookSecret) {
      throw new PaymentProviderError("STRIPE_WEBHOOK_SECRET 未設定（検証不可）", "bad_signature");
    }
    if (!sig) {
      throw new PaymentProviderError("stripe-signature ヘッダがありません", "bad_signature");
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sig, this.config.webhookSecret);
    } catch {
      throw new PaymentProviderError("Stripe 署名が一致しません", "bad_signature");
    }

    return mapStripeEvent(event);
  }
}

/** Stripe イベントを内部の PaymentEvent へ写像する。facilityId は metadata から取得。 */
export function mapStripeEvent(event: Stripe.Event): PaymentEvent {
  const eventId = event.id;

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const facilityId = facilityIdFrom(s.metadata);
      if (!facilityId) throw new PaymentProviderError("facilityId 不明（checkout）", "bad_payload");
      if (s.mode === "subscription") {
        return {
          type: "trial_started",
          eventId,
          facilityId,
          customerId: typeof s.customer === "string" ? s.customer : undefined,
          subscriptionId: typeof s.subscription === "string" ? s.subscription : undefined,
        };
      }
      // 単発決済（正式公開 5,000円）
      return {
        type: "payment_succeeded",
        eventId,
        facilityId,
        kind: "publish_5000",
        amount: s.amount_total ?? 5000,
      };
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      const facilityId = facilityIdFromInvoice(inv);
      if (!facilityId) throw new PaymentProviderError("facilityId 不明（invoice）", "bad_payload");
      return { type: "payment_succeeded", eventId, facilityId, kind: "subscription", amount: inv.amount_paid };
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const facilityId = facilityIdFromInvoice(inv);
      if (!facilityId) throw new PaymentProviderError("facilityId 不明（invoice失敗）", "bad_payload");
      return { type: "payment_failed", eventId, facilityId, kind: "subscription", amount: inv.amount_due };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const facilityId = facilityIdFrom(sub.metadata);
      if (!facilityId) throw new PaymentProviderError("facilityId 不明（解約）", "bad_payload");
      return { type: "subscription_canceled", eventId, facilityId };
    }

    case "customer.subscription.resumed": {
      const sub = event.data.object as Stripe.Subscription;
      const facilityId = facilityIdFrom(sub.metadata);
      if (!facilityId) throw new PaymentProviderError("facilityId 不明（再開）", "bad_payload");
      return { type: "subscription_resumed", eventId, facilityId, subscriptionId: sub.id };
    }

    default:
      throw new PaymentProviderError(`未対応の Stripe イベント: ${event.type}`, "bad_payload");
  }
}
