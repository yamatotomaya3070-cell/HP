import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveEditProvider } from "@/server/edit/editModelFactory.js";
import { EditModelError } from "@/server/edit/editModel.js";

// 各テストで環境変数を退避・復元し、他テストへ漏らさない。
const KEYS = ["EDIT_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"] as const;

describe("resolveEditProvider（プロバイダ選択）", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("EDIT_PROVIDER=gemini を明示すれば gemini", () => {
    process.env.EDIT_PROVIDER = "gemini";
    expect(resolveEditProvider()).toBe("gemini");
  });

  it("EDIT_PROVIDER=claude を明示すれば claude（大文字・空白も許容）", () => {
    process.env.EDIT_PROVIDER = " Claude ";
    expect(resolveEditProvider()).toBe("claude");
  });

  it("未指定で GEMINI_API_KEY があれば gemini", () => {
    process.env.GEMINI_API_KEY = "AIza-dummy";
    expect(resolveEditProvider()).toBe("gemini");
  });

  it("未指定で ANTHROPIC_API_KEY のみなら claude", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-dummy";
    expect(resolveEditProvider()).toBe("claude");
  });

  it("両方の鍵があれば gemini を優先", () => {
    process.env.GEMINI_API_KEY = "AIza-dummy";
    process.env.ANTHROPIC_API_KEY = "sk-ant-dummy";
    expect(resolveEditProvider()).toBe("gemini");
  });

  it("鍵が一切無ければ not_configured", () => {
    try {
      resolveEditProvider();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EditModelError);
      expect((e as EditModelError).kind).toBe("not_configured");
    }
  });

  it("EDIT_PROVIDER が不正値なら not_configured", () => {
    process.env.EDIT_PROVIDER = "openai";
    process.env.GEMINI_API_KEY = "AIza-dummy";
    try {
      resolveEditProvider();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EditModelError);
      expect((e as EditModelError).kind).toBe("not_configured");
    }
  });
});
