import { describe, it, expect } from "vitest";
import { parseProposal, EditModelError } from "@/server/edit/editModel.js";

describe("parseProposal（モデル出力の解釈）", () => {
  it("素のJSONを解釈できる", () => {
    const raw = JSON.stringify({
      message: "営業時間を設定しました。",
      ops: [{ op: "set_detail", field: "businessHours", value: "9:00〜17:00" }],
    });
    const p = parseProposal(raw);
    expect(p.ops).toHaveLength(1);
    expect(p.message).toContain("営業時間");
  });

  it("コードフェンス付き出力からJSONを抽出できる", () => {
    const raw =
      "承知しました。\n```json\n" +
      JSON.stringify({ message: "ok", ops: [] }) +
      "\n```\nよろしくお願いします。";
    const p = parseProposal(raw);
    expect(p.ops).toHaveLength(0);
  });

  it("前後に説明文がある生JSONでも抽出できる", () => {
    const raw =
      'はい。 {"message":"配色を変更しました","ops":[{"op":"set_theme","preset":"green"}]} 以上です。';
    const p = parseProposal(raw);
    expect(p.ops[0]).toMatchObject({ op: "set_theme", preset: "green" });
  });

  it("JSONが無ければ bad_output エラー", () => {
    expect(() => parseProposal("すみません、できません。")).toThrowError(
      EditModelError,
    );
  });

  it("提案スキーマに合わない出力は bad_output エラー", () => {
    const raw = JSON.stringify({ ops: "not-an-array" });
    try {
      parseProposal(raw);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EditModelError);
      expect((e as EditModelError).kind).toBe("bad_output");
    }
  });
});
