import { describe, test, expect } from "vitest";
import {
  normalizeText,
  normalizePhone,
  normalizeEmail,
  buildDedupKey,
  normalizeRecord,
} from "@/server/import/normalize.js";

describe("normalizeText", () => {
  test("全角と半角・空白の揺れを吸収する", () => {
    // Arrange / Act / Assert
    expect(normalizeText("株式会社 ＡＢＣ")).toBe("株式会社abc");
    expect(normalizeText("  ＡＢＣ  ")).toBe("abc");
  });

  test("null/undefined は空文字", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("normalizePhone", () => {
  test("区切り・全角を除去して数字のみにする", () => {
    expect(normalizePhone("0742-81-4880")).toBe("0742814880");
    expect(normalizePhone("０７４２ー８１ー４８８０")).toBe("0742814880");
  });
});

describe("normalizeEmail", () => {
  test("小文字化し不正形式は null", () => {
    expect(normalizeEmail(" Foo@Bar.co.JP ")).toBe("foo@bar.co.jp");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("buildDedupKey", () => {
  test("表記揺れが同じ複合キーに収束する", () => {
    const a = buildDedupKey({
      corpName: "株式会社ＨＳＳ",
      name: "ジョブタス奈良 三条通り事業所",
      tel: "0742-81-4880",
      address: "奈良県奈良市三条町472番地",
    });
    const b = buildDedupKey({
      corpName: "株式会社HSS",
      name: "ジョブタス奈良三条通り事業所",
      tel: "０７４２８１４８８０",
      address: "奈良県奈良市三条町４７２番地",
    });
    expect(a).toBe(b);
  });
});

describe("normalizeRecord", () => {
  test("emailStatus をマップし prefecture を付与できる", () => {
    const n = normalizeRecord(
      { name: "テスト事業所", email: "x@y.co.jp", status: "ok" },
      "奈良県",
    );
    expect(n.emailStatus).toBe("ok");
    expect(n.prefecture).toBe("奈良県");
  });

  test("error: 始まりの status は error へ", () => {
    const n = normalizeRecord({ name: "A", status: "error: timeout" });
    expect(n.emailStatus).toBe("error");
  });
});
