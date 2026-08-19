import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  isApexDomain,
  buildDnsInstruction,
  VERCEL_A_RECORD,
  VERCEL_CNAME_TARGET,
} from "@/server/domains/dnsInstructions.js";

describe("ドメイン正規化", () => {
  it("スキーム・パス・末尾ドット・大文字を除去する", () => {
    expect(normalizeDomain("https://WWW.Example.JP/foo")).toBe("www.example.jp");
    expect(normalizeDomain("  example.jp.  ")).toBe("example.jp");
  });
});

describe("apex 判定", () => {
  it("ラベル2つは apex、3つ以上はサブドメイン", () => {
    expect(isApexDomain("example.jp")).toBe(true);
    expect(isApexDomain("www.example.jp")).toBe(false);
    expect(isApexDomain("hp.example.co")).toBe(false);
  });
});

describe("DNS手順の生成", () => {
  it("apex は A レコード（Vercel の向き先）", () => {
    const ins = buildDnsInstruction("example.jp");
    expect(ins.isApex).toBe(true);
    expect(ins.records).toEqual([{ type: "A", name: "@", value: VERCEL_A_RECORD }]);
    expect(ins.domain).toBe("example.jp");
  });

  it("サブドメインは CNAME（ラベル名で）", () => {
    const ins = buildDnsInstruction("https://www.example.jp");
    expect(ins.isApex).toBe(false);
    expect(ins.records).toEqual([{ type: "CNAME", name: "www", value: VERCEL_CNAME_TARGET }]);
    expect(ins.domain).toBe("www.example.jp");
  });

  it("note に対象ドメインが入る", () => {
    expect(buildDnsInstruction("www.example.jp").note).toContain("www.example.jp");
  });
});
