import { describe, test, expect } from "vitest";
import { parseMenuCommand, MENU, proConsultMessages } from "@/server/line/menuCommands.js";
import { PRO_EDIT_FEE, PRO_EDIT_FEE_PRO_PLAN } from "@/server/billing/lifecycle.js";

describe("parseMenuCommand", () => {
  test("リッチメニューの文言を判定する", () => {
    expect(parseMenuCommand("料金プラン")).toBe(MENU.PRICING);
    expect(parseMenuCommand("プロに相談")).toBe(MENU.PRO);
  });

  test("前後の空白は無視する", () => {
    expect(parseMenuCommand("  使い方  ")).toBe(MENU.HOWTO);
  });

  test("メニュー外の自由文は null", () => {
    expect(parseMenuCommand("送迎ありに直して")).toBeNull();
  });
});

describe("proConsultMessages: プランで料金表示を変える", () => {
  test("上級プラン契約者には割引価格を伝える", () => {
    // Arrange / Act
    const msgs = proConsultMessages(true);

    // Assert
    expect(msgs.join("\n")).toContain(`${PRO_EDIT_FEE_PRO_PLAN.toLocaleString()}円`);
    expect(msgs.join("\n")).not.toContain(`${PRO_EDIT_FEE.toLocaleString()}円`);
  });

  test("それ以外（無料/通常プラン/未加入）には通常価格を伝える", () => {
    const msgs = proConsultMessages(false);
    expect(msgs.join("\n")).toContain(`${PRO_EDIT_FEE.toLocaleString()}円`);
    expect(msgs.join("\n")).not.toContain(`${PRO_EDIT_FEE_PRO_PLAN.toLocaleString()}円`);
  });

  test("プラン不明（事業所未確定）でも通常価格で案内する", () => {
    const msgs = proConsultMessages();
    expect(msgs.join("\n")).toContain(`${PRO_EDIT_FEE.toLocaleString()}円`);
  });
});
