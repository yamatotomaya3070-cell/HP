import { describe, it, expect, beforeAll } from "vitest";
import { issueToken, verifyToken } from "@/lib/tokens.js";

beforeAll(() => {
  process.env.TOKEN_SIGNING_SECRET = "test-secret-please-use-a-long-random-value";
});

describe("署名付きトークン", () => {
  it("発行→検証で事業所IDと用途が復元される", () => {
    const t = issueToken("fac_123", "edit");
    const r = verifyToken(t, "edit");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.facilityId).toBe("fac_123");
      expect(r.purpose).toBe("edit");
    }
  });

  it("用途違いは拒否される", () => {
    const t = issueToken("fac_123", "edit");
    expect(verifyToken(t, "reply").ok).toBe(false);
  });

  it("改ざん署名は bad_signature", () => {
    const t = issueToken("fac_123", "edit");
    const tampered = t.slice(0, -2) + (t.endsWith("a") ? "bb" : "aa");
    const r = verifyToken(tampered, "edit");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("ペイロード改ざん（別事業所）は署名不一致で拒否", () => {
    const t = issueToken("fac_123", "edit");
    const [, sig] = t.split(".");
    const forged =
      Buffer.from(JSON.stringify({ fid: "fac_999", p: "edit", exp: 9999999999 }))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "") +
      "." +
      sig;
    expect(verifyToken(forged, "edit").ok).toBe(false);
  });

  it("期限切れは expired", () => {
    const t = issueToken("fac_123", "edit", -1);
    const r = verifyToken(t, "edit");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("壊れた形式は malformed", () => {
    expect(verifyToken("not-a-token", "edit")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });
});
