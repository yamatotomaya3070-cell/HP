import { describe, it, expect, beforeAll } from "vitest";
import { composeSalesEmail } from "@/server/mail/composeSales.js";
import { buildUnsubscribeUrl, verifyUnsubscribeToken } from "@/server/mail/unsubscribe.js";

// 署名鍵はトークン系の前提。テスト内で固定する。
beforeAll(() => {
  process.env.TOKEN_SIGNING_SECRET = "test-signing-secret-1234567890";
});

describe("営業メール本文の組立", () => {
  const ctx = {
    facilityName: "テスト事業所",
    previewUrl: "http://localhost:3000/preview/abc123",
    unsubscribeUrl: "http://localhost:3000/unsubscribe/tok",
    sender: { orgName: "合同会社絆", address: "奈良県…", contact: "info@example.com" },
  };

  it("件名と本文に事業所名が入る", () => {
    const { subject, text } = composeSalesEmail(ctx);
    expect(subject).toContain("テスト事業所");
    expect(text).toContain("テスト事業所 ご担当者様");
  });

  it("プレビューリンクと配信停止リンクを必ず含む", () => {
    const { text } = composeSalesEmail(ctx);
    expect(text).toContain(ctx.previewUrl);
    expect(text).toContain(ctx.unsubscribeUrl);
  });

  it("送信者情報（特定電子メール法）を明示する", () => {
    const { text } = composeSalesEmail(ctx);
    expect(text).toContain("送信者: 合同会社絆");
    expect(text).toContain("所在地: 奈良県…");
    expect(text).toContain("連絡先: info@example.com");
  });

  it("住所・連絡先が無くても組み立てられ、その行は出さない", () => {
    const { text } = composeSalesEmail({ ...ctx, sender: { orgName: "合同会社絆" } });
    expect(text).toContain("送信者: 合同会社絆");
    expect(text).not.toContain("所在地:");
    expect(text).not.toContain("連絡先:");
  });

  it("返信で修正できる導線と、サンプルである旨を明示する", () => {
    const { text } = composeSalesEmail(ctx);
    expect(text).toContain("ご返信");
    expect(text).toContain("サンプル");
  });
});

describe("配信停止トークン", () => {
  it("発行したURLのトークンは unsubscribe 用途として検証できる", () => {
    const url = buildUnsubscribeUrl("fac_123", "http://localhost:3000");
    expect(url.startsWith("http://localhost:3000/unsubscribe/")).toBe(true);
    const token = url.split("/unsubscribe/")[1];
    const result = verifyUnsubscribeToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facilityId).toBe("fac_123");
  });

  it("改ざんされたトークンは拒否する", () => {
    const url = buildUnsubscribeUrl("fac_123", "http://localhost:3000");
    const token = url.split("/unsubscribe/")[1];
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyUnsubscribeToken(tampered).ok).toBe(false);
  });
});
