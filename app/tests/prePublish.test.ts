import { describe, it, expect } from "vitest";
import {
  prePublishConfirmSchema,
  buildPublishReview,
  PRE_PUBLISH_ITEMS,
} from "@/lib/prePublish.js";
import { buildInitialSiteData } from "@/server/generate/buildInitialSiteData.js";

describe("公開前確認スキーマ", () => {
  it("全項目 true なら通る", () => {
    const ok = prePublishConfirmSchema.safeParse({
      contentAccurate: true,
      photoConsent: true,
      contactCorrect: true,
      termsAgreed: true,
      privacyAgreed: true,
    });
    expect(ok.success).toBe(true);
  });

  it("1つでも false なら弾く（未チェックでは公開させない）", () => {
    const ng = prePublishConfirmSchema.safeParse({
      contentAccurate: true,
      photoConsent: false,
      contactCorrect: true,
      termsAgreed: true,
      privacyAgreed: true,
    });
    expect(ng.success).toBe(false);
  });

  it("項目が欠けていれば弾く", () => {
    const ng = prePublishConfirmSchema.safeParse({ contentAccurate: true });
    expect(ng.success).toBe(false);
  });

  it("チェック項目は5件", () => {
    expect(PRE_PUBLISH_ITEMS).toHaveLength(5);
  });
});

describe("公開前レビューの組立", () => {
  const data = buildInitialSiteData({
    name: "テスト事業所",
    corpName: "株式会社テスト",
    address: "奈良県奈良市1-2-3",
    prefecture: "奈良県",
    tel: "0742-00-0000",
  });

  it("確認済みの事実は値が入り missing=false", () => {
    const review = buildPublishReview(data, "テスト事業所");
    const addr = review.find((r) => r.label === "所在地");
    expect(addr?.value).toContain("奈良市");
    expect(addr?.missing).toBe(false);
  });

  it("未確認の事実は『準備中』かつ missing=true", () => {
    const review = buildPublishReview(data, "テスト事業所");
    const lunch = review.find((r) => r.label === "昼食");
    expect(lunch?.missing).toBe(true);
    expect(lunch?.value).toContain("準備中");
  });

  it("事業所名は必ず表示される", () => {
    const review = buildPublishReview(data, "テスト事業所");
    expect(review[0]).toMatchObject({ label: "事業所名", value: "テスト事業所", missing: false });
  });
});
