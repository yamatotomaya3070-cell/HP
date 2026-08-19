import { describe, it, expect } from "vitest";
import { scoreEvents, hotBand, HOT_WEIGHTS } from "@/lib/leadScore.js";

describe("本命スコア", () => {
  it("開封のみは0点（意図的に除外）", () => {
    expect(scoreEvents(["email_opened", "email_opened"])).toBe(0);
    expect(HOT_WEIGHTS.email_opened).toBe(0);
  });

  it("返信・編集・カード・公開・契約は加点で合算される", () => {
    // 3 + 4 + 6 + 8 + 10
    const score = scoreEvents([
      "email_replied",
      "ai_edit",
      "card_registered",
      "published",
      "subscribed",
    ]);
    expect(score).toBe(31);
  });

  it("離脱シグナル（解約・配信停止）は減点", () => {
    expect(scoreEvents(["published", "canceled"])).toBe(8 - 4);
    expect(scoreEvents(["subscribed", "suppressed"])).toBe(10 - 8);
  });

  it("未知の種別は0点として無視", () => {
    expect(scoreEvents(["unknown_type", "ai_edit"])).toBe(4);
  });

  it("区分: 10以上=hot / 4以上=warm / それ未満=cold", () => {
    expect(hotBand(10)).toBe("hot");
    expect(hotBand(31)).toBe("hot");
    expect(hotBand(4)).toBe("warm");
    expect(hotBand(9)).toBe("warm");
    expect(hotBand(3)).toBe("cold");
    expect(hotBand(0)).toBe("cold");
  });
});
