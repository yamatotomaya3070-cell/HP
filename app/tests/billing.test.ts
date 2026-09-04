import { describe, it, expect } from "vitest";
import {
  normalizePaymentEvent,
  PaymentProviderError,
} from "@/server/billing/provider.js";
import { TRIAL_DAYS, MONTHLY_FEE, MONTHLY_FEE_PRO } from "@/server/billing/lifecycle.js";
import { mapStripeEvent } from "@/server/billing/stripeProvider.js";
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
