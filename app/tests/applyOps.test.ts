import { describe, it, expect } from "vitest";
import { applyOps } from "@/server/edit/applyOps.js";
import { buildInitialSiteData } from "@/server/generate/buildInitialSiteData.js";
import { siteDataSchema, SECTIONS } from "@/lib/siteData.js";

function base() {
  return buildInitialSiteData({
    name: "テスト事業所",
    corpName: "株式会社テスト",
    address: "奈良県奈良市1-2-3",
    prefecture: "奈良県",
    tel: "0742-00-0000",
  });
}

describe("applyOps ホワイトリスト適用", () => {
  it("set_detail で未確認の事実を confirmed 化できる（事業所の申告）", () => {
    const { data, appliedCount, rejected } = applyOps(base(), [
      { op: "set_detail", field: "businessHours", value: "9:00〜17:00" },
    ]);
    expect(appliedCount).toBe(1);
    expect(rejected).toHaveLength(0);
    expect(data.details.businessHours).toEqual({
      value: "9:00〜17:00",
      state: "confirmed",
    });
  });

  it("set_services で items を与えると confirmed 化し「準備中」でなくなる", () => {
    const { data } = applyOps(base(), [
      {
        op: "set_services",
        items: [{ title: "生活支援", description: "" }],
      },
    ]);
    expect(data.services.state).toBe("confirmed");
    expect(data.services.items).toHaveLength(1);
  });

  it("clear_detail で掲載を取りやめ未確認へ戻せる", () => {
    const { data } = applyOps(base(), [
      { op: "clear_detail", field: "address" },
    ]);
    expect(data.details.address.state).toBe("unconfirmed");
    expect(data.details.address.value).toBeNull();
  });

  it("不変性: 元データは変更されない", () => {
    const b = base();
    const snapshot = JSON.stringify(b);
    applyOps(b, [{ op: "set_detail", field: "tel", value: "999" }]);
    expect(JSON.stringify(b)).toBe(snapshot);
  });

  it("未知の op は不採用（ホワイトリスト外）", () => {
    const { appliedCount, rejected } = applyOps(base(), [
      { op: "delete_everything" },
      { op: "set_slug", slug: "hack" },
    ]);
    expect(appliedCount).toBe(0);
    expect(rejected).toHaveLength(2);
  });

  it("スキーマ外のキーを混ぜても無視され、許可分だけ適用", () => {
    const { data, appliedCount } = applyOps(base(), [
      {
        op: "set_hero",
        headline: "新見出し",
        publishState: "published", // ← 無関係なキーは効かない
        slug: "evil",
      },
    ]);
    expect(appliedCount).toBe(1);
    expect(data.hero.headline).toBe("新見出し");
    // SiteData に slug/publishState は存在しない（テンプレ/DB制御外）
    expect((data as Record<string, unknown>).slug).toBeUndefined();
    expect((data as Record<string, unknown>).publishState).toBeUndefined();
  });

  it("長すぎる値は検証で弾かれる", () => {
    const { appliedCount, rejected } = applyOps(base(), [
      { op: "set_detail", field: "tel", value: "x".repeat(401) },
    ]);
    expect(appliedCount).toBe(0);
    expect(rejected[0].reason).toBeTruthy();
  });

  it("reorder_sections は欠けたセクションを末尾補完し全網羅を保つ", () => {
    const { data } = applyOps(base(), [
      { op: "reorder_sections", order: ["contact", "hero"] },
    ]);
    expect(data.layout.sectionOrder[0]).toBe("contact");
    expect(data.layout.sectionOrder[1]).toBe("hero");
    // 全セクション(9種)が失われない
    expect(new Set(data.layout.sectionOrder).size).toBe(SECTIONS.length);
  });

  it("set_section_visibility で非表示/再表示できる", () => {
    const hide = applyOps(base(), [
      { op: "set_section_visibility", section: "gallery", visible: false },
    ]);
    expect(hide.data.layout.hidden).toContain("gallery");
    const show = applyOps(hide.data, [
      { op: "set_section_visibility", section: "gallery", visible: true },
    ]);
    expect(show.data.layout.hidden).not.toContain("gallery");
  });

  it("複数操作: 通る分は適用し、壊れる分だけ不採用", () => {
    const { data, appliedCount, rejected } = applyOps(base(), [
      { op: "set_detail", field: "lunch", value: "あり（自家製）" },
      { op: "set_theme", preset: "invalid_theme" }, // 不正
      { op: "set_theme", preset: "green" },
    ]);
    expect(appliedCount).toBe(2);
    expect(rejected).toHaveLength(1);
    expect(data.details.lunch.state).toBe("confirmed");
    expect(data.theme.preset).toBe("green");
  });

  it("適用結果は常に SiteData スキーマを満たす", () => {
    const { data } = applyOps(base(), [
      { op: "set_hero", headline: "H", catchCopy: "C" },
      { op: "set_about", body: ["a", "b"] },
      { op: "set_detail", field: "wage", value: "月平均15,000円" },
    ]);
    expect(siteDataSchema.safeParse(data).success).toBe(true);
  });

  it("set_daily_flow で一日の流れを confirmed 化できる", () => {
    const { data, appliedCount } = applyOps(base(), [
      {
        op: "set_daily_flow",
        steps: [
          { time: "10:00", title: "朝礼", description: "予定確認", icon: "people" },
          { time: "15:00", title: "終礼", icon: "flag" },
        ],
      },
    ]);
    expect(appliedCount).toBe(1);
    expect(data.dailyFlow.state).toBe("confirmed");
    expect(data.dailyFlow.steps).toHaveLength(2);
    expect(data.dailyFlow.steps[0].icon).toBe("people");
  });

  it("set_highlights / set_hero_media はヒーローだけを更新する", () => {
    const { data } = applyOps(base(), [
      {
        op: "set_highlights",
        highlights: [
          { icon: "bus", label: "送迎相談可" },
          { icon: "lunch", label: "昼食あり" },
        ],
      },
      { op: "set_hero_media", image: "https://example.com/a.jpg", imageAlt: "作業風景" },
    ]);
    expect(data.hero.highlights).toHaveLength(2);
    expect(data.hero.image).toBe("https://example.com/a.jpg");
    expect(data.hero.imageAlt).toBe("作業風景");
    // 見出しは温存される
    expect(data.hero.headline).toBe("テスト事業所");
  });

  it("不正なアイコンキーの highlight は不採用", () => {
    const { appliedCount, rejected } = applyOps(base(), [
      { op: "set_highlights", highlights: [{ icon: "bogus", label: "x" }] },
    ]);
    expect(appliedCount).toBe(0);
    expect(rejected).toHaveLength(1);
  });

  it("add_photo は既存写真に追記し、set_gallery は全置換する", () => {
    const added = applyOps(base(), [
      { op: "add_photo", photo: { url: "https://x/1.jpg", alt: "1", caption: "" } },
      { op: "add_photo", photo: { url: "https://x/2.jpg", alt: "2", caption: "" } },
    ]);
    expect(added.data.gallery.photos).toHaveLength(2);
    const replaced = applyOps(added.data, [
      { op: "set_gallery", photos: [{ url: "https://x/9.jpg", alt: "9", caption: "" }] },
    ]);
    expect(replaced.data.gallery.photos).toHaveLength(1);
    expect(replaced.data.gallery.photos[0].url).toBe("https://x/9.jpg");
  });

  it("set_access で mapQuery と補足を設定できる", () => {
    const { data, appliedCount } = applyOps(base(), [
      { op: "set_access", mapQuery: "奈良県奈良市登大路町", note: "近鉄奈良駅 徒歩5分" },
    ]);
    expect(appliedCount).toBe(1);
    expect(data.access.mapQuery).toBe("奈良県奈良市登大路町");
    expect(data.access.note).toBe("近鉄奈良駅 徒歩5分");
  });

  it("set_contact は CTA カードのフィールドを更新できる", () => {
    const { data } = applyOps(base(), [
      {
        op: "set_contact",
        ctaTitle: "ご利用をお考えの方へ",
        ctaBody: "見学は随時受け付けています。",
        ctaLabel: "まずはお気軽にご相談ください",
      },
    ]);
    expect(data.contact.ctaTitle).toBe("ご利用をお考えの方へ");
    expect(data.contact.ctaLabel).toBe("まずはお気軽にご相談ください");
    // note は温存
    expect(data.contact.note).toBeTruthy();
  });
});
