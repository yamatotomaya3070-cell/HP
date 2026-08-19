import { describe, it, expect } from "vitest";
import { generateSlug } from "@/lib/slug.js";

describe("generateSlug", () => {
  it("既定の長さは22文字", () => {
    expect(generateSlug()).toHaveLength(22);
  });

  it("紛らわしい文字(0,o,1,l,i)を含まない", () => {
    const s = generateSlug(200);
    expect(s).not.toMatch(/[0o1li]/);
  });

  it("許可された文字のみ", () => {
    expect(generateSlug(200)).toMatch(/^[a-z2-9]+$/);
  });

  it("十分に一意（1000生成で衝突なし）", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateSlug());
    expect(set.size).toBe(1000);
  });
});
