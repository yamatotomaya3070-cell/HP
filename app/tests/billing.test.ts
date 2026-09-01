import { describe, it, expect } from "vitest";
import {
  normalizePaymentEvent,
  PaymentProviderError,
} from "@/server/billing/provider.js";
import { TRIAL_DAYS, MONTHLY_FEE, MONTHLY_FEE_PRO } from "@/server/billing/lifecycle.js";

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
});
