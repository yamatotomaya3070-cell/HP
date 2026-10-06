import { describe, it, expect } from "vitest";
import {
  normalizePaymentEvent,
  PaymentProviderError,
} from "@/server/billing/provider.js";
import { TRIAL_DAYS, MONTHLY_FEE, MONTHLY_FEE_PRO } from "@/server/billing/lifecycle.js";
import { mapStripeEvent, StripePaymentProvider } from "@/server/billing/stripeProvider.js";
import type Stripe from "stripe";

describe("決済イベント正規化", () => {
  it("trial_started を正規化", () => {
    const e = normalizePaymentEvent({
      type: "trial_started",
      eventId: "evt_1",
      facilityId: "fac_1",
      subscriptionId: "sub_1",
    });
    expect(e).toMatchObject({ type: "trial_started", eventId: "evt_1", facilityId: "fac_1" });
  });

  it("payment_succeeded は kind 既定 publish_5000・amount 補完", () => {
    const e = normalizePaymentEvent({
      type: "payment_succeeded",
      eventId: "evt_2",
      facilityId: "fac_1",
    });
    expect(e).toMatchObject({ type: "payment_succeeded", kind: "publish_5000", amount: 5000 });
  });

  it("eventId 欠如は bad_payload（冪等キーは必須）", () => {
    expect(() =>
      normalizePaymentEvent({ type: "trial_started", facilityId: "fac_1" }),
    ).toThrowError(PaymentProviderError);
  });

  it("未知イベントは bad_payload", () => {
    expect(() =>
      normalizePaymentEvent({ type: "??", eventId: "e", facilityId: "f" }),
    ).toThrowError(PaymentProviderError);
  });

  it("料金体系の定数（7日トライアル・竹5,000円・松7,000円）が仕様どおり", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(MONTHLY_FEE).toBe(5000);
    expect(MONTHLY_FEE_PRO).toBe(7000);
  });

  it("trial_started は plan を受け取れる（省略時は standard）", () => {
    const withPlan = normalizePaymentEvent({
      type: "trial_started",
      eventId: "evt_3",
      facilityId: "fac_1",
      plan: "pro",
    });
    expect(withPlan).toMatchObject({ type: "trial_started", plan: "pro" });

    const withoutPlan = normalizePaymentEvent({
      type: "trial_started",
      eventId: "evt_4",
      facilityId: "fac_1",
    });
    expect(withoutPlan).toMatchObject({ type: "trial_started", plan: "standard" });
  });

  it("plan に standard/pro 以外が来たら standard 扱い（不正値で弾かない）", () => {
    const e = normalizePaymentEvent({
      type: "trial_started",
      eventId: "evt_5",
      facilityId: "fac_1",
      plan: "gold",
    });
    expect(e).toMatchObject({ plan: "standard" });
  });
});

describe("Stripe イベント → 内部イベントの写像（plan判定）", () => {
  function checkoutEvent(metadata: Record<string, string>): Stripe.Event {
    return {
      id: "evt_cs_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          metadata,
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    } as unknown as Stripe.Event;
  }

  it("Checkout session の metadata.plan を trial_started へ引き継ぐ", () => {
    const e = mapStripeEvent(checkoutEvent({ facilityId: "fac_1", plan: "pro" }));
    expect(e).toMatchObject({ type: "trial_started", facilityId: "fac_1", plan: "pro" });
  });

  it("metadata.plan が無ければ standard", () => {
    const e = mapStripeEvent(checkoutEvent({ facilityId: "fac_1" }));
    expect(e).toMatchObject({ type: "trial_started", plan: "standard" });
  });
});

describe("Stripe Checkout の体験日数", () => {
  it("サイト表示と同じ TRIAL_DAYS 日後に課金が始まる", async () => {
    const provider = new StripePaymentProvider({
      secretKey: "sk_test_dummy",
      subscriptionPriceId: "price_std",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/ng",
    });
    let params: Stripe.Checkout.SessionCreateParams | undefined;
    (provider as unknown as { stripe: unknown }).stripe = {
      checkout: {
        sessions: {
          create: async (p: Stripe.Checkout.SessionCreateParams) => {
            params = p;
            return { id: "cs_1", url: "https://checkout.stripe.com/x" };
          },
        },
      },
    };
    await provider.createTrialCheckout({ facilityId: "fac_1", plan: "standard" });
    expect(params?.subscription_data?.trial_period_days).toBe(TRIAL_DAYS);
  });
});

describe("Stripe 請求書イベントの写像", () => {
  function invoiceEvent(type: string, invoice: Record<string, unknown>): Stripe.Event {
    return { id: "evt_in_1", type, data: { object: invoice } } as unknown as Stripe.Event;
  }
  // 現行API(2025-03以降)ではサブスクの metadata は parent.subscription_details に入る
  const parent = { parent: { subscription_details: { metadata: { facilityId: "fac_1" } } } };

  it("parent.subscription_details.metadata から facilityId を取り出す", () => {
    const e = mapStripeEvent(invoiceEvent("invoice.paid", { ...parent, amount_paid: 5000 }));
    expect(e).toMatchObject({ type: "payment_succeeded", facilityId: "fac_1", kind: "subscription", amount: 5000 });
  });

  it("旧API形式(subscription_details直下)も引き続き読める", () => {
    const e = mapStripeEvent(
      invoiceEvent("invoice.paid", { subscription_details: { metadata: { facilityId: "fac_1" } }, amount_paid: 5000 }),
    );
    expect(e).toMatchObject({ type: "payment_succeeded", facilityId: "fac_1" });
  });

  it("体験開始時の0円請求書は契約成立扱いにしない", () => {
    const e = mapStripeEvent(invoiceEvent("invoice.paid", { ...parent, amount_paid: 0 }));
    expect(e).toMatchObject({ type: "ignored" });
  });

  it("invoice.payment_succeeded は invoice.paid と二重計上しないよう無視する", () => {
    const e = mapStripeEvent(invoiceEvent("invoice.payment_succeeded", { ...parent, amount_paid: 5000 }));
    expect(e).toMatchObject({ type: "ignored" });
  });

  it("支払い失敗は parent 経由でも facilityId を取れる", () => {
    const e = mapStripeEvent(invoiceEvent("invoice.payment_failed", { ...parent, amount_due: 5000 }));
    expect(e).toMatchObject({ type: "payment_failed", facilityId: "fac_1", amount: 5000 });
  });

  it("未対応イベントはエラーにせず無視（Stripeの再送ループを防ぐ）", () => {
    const e = mapStripeEvent(invoiceEvent("customer.created", {}));
    expect(e).toMatchObject({ type: "ignored" });
  });
});
