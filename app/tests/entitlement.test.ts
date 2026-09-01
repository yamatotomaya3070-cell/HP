import { describe, test, expect } from "vitest";
import {
  MAX_FREE_EDITS,
  decideEntitlement,
  type EntitlementInput,
} from "@/server/billing/entitlement.js";

const base: EntitlementInput = {
  subscriptionState: null,
  publishState: "preview",
  appliedEditCount: 0,
};

describe("無料プラン（未契約）", () => {
  test("3回までは編集でき、残り回数が分かる", () => {
    // Arrange / Act
    const first = decideEntitlement({ ...base, appliedEditCount: 0 });
    const third = decideEntitlement({ ...base, appliedEditCount: 2 });

    // Assert
    expect(first.canEdit).toBe(true);
    expect(first.remainingFreeEdits).toBe(3);
    expect(third.canEdit).toBe(true);
    expect(third.remainingFreeEdits).toBe(1);
  });

  test("3回使い切ると編集できない", () => {
    // Arrange / Act
    const e = decideEntitlement({ ...base, appliedEditCount: MAX_FREE_EDITS });

    // Assert
    expect(e.canEdit).toBe(false);
    expect(e.remainingFreeEdits).toBe(0);
    expect(e.blockedReason).toBe("free_limit");
  });

  test("無料プランでは公開できない", () => {
    expect(decideEntitlement(base).canPublish).toBe(false);
  });

  test("超過して数えられていても残りは0で止まる", () => {
    const e = decideEntitlement({ ...base, appliedEditCount: 99 });
    expect(e.remainingFreeEdits).toBe(0);
    expect(e.canEdit).toBe(false);
  });
});

describe("トライアル・契約中", () => {
  test("トライアル中は無制限に編集でき公開もできる", () => {
    // Arrange / Act
    const e = decideEntitlement({
      ...base,
      subscriptionState: "trialing",
      appliedEditCount: 50,
    });

    // Assert
    expect(e.canEdit).toBe(true);
    expect(e.canPublish).toBe(true);
    expect(e.plan).toBe("trialing");
    expect(e.remainingFreeEdits).toBeUndefined();
  });

  test("契約中は無制限に編集でき公開もできる", () => {
    const e = decideEntitlement({ ...base, subscriptionState: "active", appliedEditCount: 99 });
    expect(e.canEdit).toBe(true);
    expect(e.canPublish).toBe(true);
  });

  test("支払い失敗中でも猶予として編集を止めない", () => {
    // カードの一時的な失敗で体験を壊さない（Stripeが自動リトライする）。
    const e = decideEntitlement({ ...base, subscriptionState: "past_due", appliedEditCount: 99 });
    expect(e.canEdit).toBe(true);
    expect(e.plan).toBe("past_due");
  });
});

describe("解約後", () => {
  test("解約したら編集停止（公開は継続）", () => {
    // Arrange / Act
    const e = decideEntitlement({
      ...base,
      subscriptionState: "canceled",
      publishState: "static",
      appliedEditCount: 0,
    });

    // Assert
    expect(e.canEdit).toBe(false);
    expect(e.blockedReason).toBe("canceled");
  });

  test("静的公開(static)なら契約情報が無くても編集停止", () => {
    const e = decideEntitlement({ ...base, publishState: "static" });
    expect(e.canEdit).toBe(false);
    expect(e.blockedReason).toBe("canceled");
  });

  test("解約後は無料枠に戻らない（3回の抜け道を作らない）", () => {
    const e = decideEntitlement({
      ...base,
      subscriptionState: "canceled",
      appliedEditCount: 0,
    });
    expect(e.canEdit).toBe(false);
    expect(e.blockedReason).toBe("canceled");
  });
});
