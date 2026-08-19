import { describe, it, expect } from "vitest";
import { buildInitialSiteData } from "@/server/generate/buildInitialSiteData.js";
import { siteDataSchema } from "@/lib/siteData.js";

const fullFacility = {
  name: "テスト就労支援センター",
  corpName: "株式会社テスト",
  address: "奈良県奈良市1-2-3",
  prefecture: "奈良県",
  tel: "0742-00-0000",
  fax: "0742-00-0001",
  url: "https://example.com",
  email: "info@example.com",
};

describe("buildInitialSiteData", () => {
  it("生成物はスキーマ(契約)を満たす", () => {
    const data = buildInitialSiteData(fullFacility);
    const result = siteDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("取込済みの事実は confirmed になる", () => {
    const data = buildInitialSiteData(fullFacility);
    expect(data.details.address).toEqual({
      value: "奈良県奈良市1-2-3",
      state: "confirmed",
    });
    expect(data.details.tel.state).toBe("confirmed");
    expect(data.details.corpName.value).toBe("株式会社テスト");
  });

  it("未取得の事実(送迎/営業時間/昼食/工賃)は unconfirmed で断定しない", () => {
    const data = buildInitialSiteData(fullFacility);
    for (const key of [
      "businessHours",
      "holidays",
      "accessTransport",
      "lunch",
      "wage",
    ] as const) {
      expect(data.details[key]).toEqual({ value: null, state: "unconfirmed" });
    }
  });

  it("サービス内容・作業内容は根拠がないため unconfirmed・items 空", () => {
    const data = buildInitialSiteData(fullFacility);
    expect(data.services.state).toBe("unconfirmed");
    expect(data.services.items).toHaveLength(0);
    expect(data.workContent.state).toBe("unconfirmed");
  });

  it("欠損した事実項目は unconfirmed に落ちる", () => {
    const data = buildInitialSiteData({ name: "名前だけ事業所" });
    expect(data.details.address.state).toBe("unconfirmed");
    expect(data.details.tel.state).toBe("unconfirmed");
    expect(data.details.email.state).toBe("unconfirmed");
    // 名称は必ず入る
    expect(data.hero.headline).toBe("名前だけ事業所");
  });

  it("空文字の事実は unconfirmed 扱い", () => {
    const data = buildInitialSiteData({ name: "x", tel: "   ", url: "" });
    expect(data.details.tel.state).toBe("unconfirmed");
    expect(data.details.url.state).toBe("unconfirmed");
  });

  it("about の定型文は事実（サービス等）を断定しない", () => {
    const data = buildInitialSiteData(fullFacility);
    const joined = data.about.body.join("");
    // 送迎あり/工賃◯円 のような未確認事実の断定を含まない
    expect(joined).not.toMatch(/送迎|工賃|昼食/);
  });
});
