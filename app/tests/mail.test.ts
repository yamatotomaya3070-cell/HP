import { describe, it, expect, beforeAll } from "vitest";
import { buildReplyTo, extractReplyToken, verifyReplyToken } from "@/server/mail/replyAddress.js";
import { normalizeInbound, MailProviderError } from "@/server/mail/provider.js";
import {
  composeAppliedReply,
  composeLimitReply,
} from "@/server/mail/compose.js";

beforeAll(() => {
  process.env.TOKEN_SIGNING_SECRET = "test-secret-please-use-a-long-random-value";
  process.env.MAIL_REPLY_DOMAIN = "reply.example.com";
  process.env.APP_BASE_URL = "https://app.example.com";
});

describe("Reply-To アドレス", () => {
  it("reply+<token>@domain 形式で発行し、トークンから事業所を特定できる", () => {
    const addr = buildReplyTo("fac_abc");
    expect(addr).toMatch(/^reply\+.+@reply\.example\.com$/);
    const token = extractReplyToken([addr]);
    expect(token).toBeTruthy();
    const v = verifyReplyToken(token as string);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.facilityId).toBe("fac_abc");
  });

  it("ローカル部（@より前）が RFC 5321 の 64 文字以内に収まる（実 cuid 長でも）", () => {
    // 実際の Facility.id は 25 文字の cuid。汎用トークンだと 130 文字超で送信が 422 になる回帰を防ぐ。
    const addr = buildReplyTo("cmszr74cg0002dhaovtx7v6v3");
    const localPart = addr.split("@")[0];
    expect(localPart.length).toBeLessThanOrEqual(64);
    const token = extractReplyToken([addr]);
    const v = verifyReplyToken(token as string);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.facilityId).toBe("cmszr74cg0002dhaovtx7v6v3");
  });

  it("改竄された署名は bad_signature で拒否する", () => {
    const addr = buildReplyTo("fac_abc");
    const token = extractReplyToken([addr]) as string;
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    const v = verifyReplyToken(tampered);
    expect(v.ok).toBe(false);
  });

  it("期限切れトークンは expired で拒否する", () => {
    const addr = buildReplyTo("fac_abc", -1); // 既に失効
    const token = extractReplyToken([addr]) as string;
    const v = verifyReplyToken(token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("表示名付き宛先からもトークンを抽出できる", () => {
    const addr = buildReplyTo("fac_xyz");
    const token = extractReplyToken([`絆サポート <${addr}>`, "other@x.com"]);
    expect(token).toBeTruthy();
    const v = verifyReplyToken(token as string);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.facilityId).toBe("fac_xyz");
  });

  it("reply トークンが無い宛先は null", () => {
    expect(extractReplyToken(["info@x.com", "hello@y.com"])).toBeNull();
  });
});

describe("受信ペイロード正規化", () => {
  it("from/to/text を取り出す", () => {
    const m = normalizeInbound({
      from: "a@b.com",
      to: ["reply+t@x.com"],
      text: "営業時間は9時から",
      subject: "Re: HP",
    });
    expect(m.from).toBe("a@b.com");
    expect(m.to).toHaveLength(1);
  });

  it("to が文字列単体でも配列化", () => {
    const m = normalizeInbound({ from: "a@b.com", to: "reply+t@x.com", text: "x" });
    expect(Array.isArray(m.to)).toBe(true);
  });

  it("from/to 欠如は bad_payload", () => {
    expect(() => normalizeInbound({ text: "x" })).toThrowError(MailProviderError);
  });
});

describe("自動返信の組み立て", () => {
  const ctx = {
    facilityId: "fac_abc",
    facilityName: "テスト事業所",
    slug: "abcslug",
    baseUrl: "https://app.example.com",
  };

  it("反映返信: プレビューと編集画面リンク・残回数を含む", () => {
    const r = composeAppliedReply({ ...ctx, aiMessage: "営業時間を更新しました。", remaining: 2 });
    expect(r.text).toContain("https://app.example.com/preview/abcslug");
    expect(r.text).toContain("/edit/");
    expect(r.text).toContain("あと 2 回");
  });

  it("上限返信: 編集画面へ誘導する", () => {
    const r = composeLimitReply(ctx);
    expect(r.text).toContain("上限");
    expect(r.text).toContain("/edit/");
  });
});
