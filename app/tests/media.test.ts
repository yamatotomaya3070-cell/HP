import { describe, it, expect } from "vitest";
import {
  extForContentType,
  mediaKey,
} from "@/server/media/mediaStore.js";
import {
  ATMOSPHERE_KINDS,
  assertNoPeople,
  buildAtmospherePrompt,
  ImageGeneratorError,
} from "@/server/media/imageGenerator.js";

describe("mediaStore キー生成", () => {
  it("contentType から拡張子を決める", () => {
    expect(extForContentType("image/png")).toBe("png");
    expect(extForContentType("image/jpeg")).toBe("jpg");
    expect(extForContentType("image/webp")).toBe("webp");
    expect(extForContentType("application/octet-stream")).toBe("bin");
  });

  it("mediaKey は安全な接頭辞＋拡張子付きで衝突しにくい", () => {
    const a = mediaKey("gen-workspace", "image/png");
    const b = mediaKey("gen-workspace", "image/png");
    expect(a).toMatch(/^gen-workspace-[a-z0-9]+\.png$/);
    expect(a).not.toBe(b); // ランダム性
  });

  it("mediaKey は危険文字を除去する", () => {
    const key = mediaKey("../../etc/passwd", "image/jpeg");
    expect(key).not.toContain("/");
    expect(key).not.toContain("..");
    expect(key).toMatch(/\.jpg$/);
  });
});

describe("imageGenerator 倫理ガード（人物を生成しない）", () => {
  it("人物語を含むと assertNoPeople が拒否する", () => {
    for (const term of ["a portrait of a worker", "利用者の笑顔", "smiling staff", "子どもたち"]) {
      expect(() => assertNoPeople(term)).toThrowError(ImageGeneratorError);
    }
  });

  it("人物を含まない情景は通す", () => {
    expect(() => assertNoPeople("a tidy work table with tools")).not.toThrow();
    expect(() => assertNoPeople("観葉植物と窓辺")).not.toThrow();
  });

  it("buildAtmospherePrompt は全種別で no people を含み、人物 extra を拒否する", () => {
    for (const kind of ATMOSPHERE_KINDS) {
      const prompt = buildAtmospherePrompt(kind);
      expect(prompt.toLowerCase()).toContain("no people");
    }
    expect(() => buildAtmospherePrompt("workspace", "スタッフの写真を追加")).toThrowError(
      ImageGeneratorError,
    );
  });

  it("rejected_people の kind が設定される", () => {
    try {
      assertNoPeople("person");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGeneratorError);
      expect((e as ImageGeneratorError).kind).toBe("rejected_people");
    }
  });
});
