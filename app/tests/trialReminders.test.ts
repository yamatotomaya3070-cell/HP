import { describe, it, expect } from "vitest";
import {
  calendarDaysBetween,
  milestoneForDaysRemaining,
} from "@/server/billing/trialReminders.js";
import { composeTrialReminder } from "@/server/billing/composeTrial.js";

describe("トライアル通知の暦日計算", () => {
  it("同日は0日（時刻が違っても暦日で判定）", () => {
    const from = new Date("2026-08-12T23:30:00");
    const to = new Date("2026-08-12T01:00:00");
    expect(calendarDaysBetween(from, to)).toBe(0);
  });

  it("翌日は1日", () => {
    expect(
      calendarDaysBetween(new Date("2026-08-12T20:00:00"), new Date("2026-08-13T06:00:00")),
    ).toBe(1);
  });

  it("3日後は3日", () => {
    expect(
      calendarDaysBetween(new Date("2026-08-12T09:00:00"), new Date("2026-08-15T09:00:00")),
    ).toBe(3);
  });

  it("月をまたいでも暦日で数える", () => {
    expect(
      calendarDaysBetween(new Date("2026-08-30T09:00:00"), new Date("2026-09-02T09:00:00")),
    ).toBe(3);
  });
});

describe("マイルストーン判定", () => {
  it("3→d3 / 1→d1 / 0→d0", () => {
    expect(milestoneForDaysRemaining(3)).toBe("d3");
    expect(milestoneForDaysRemaining(1)).toBe("d1");
    expect(milestoneForDaysRemaining(0)).toBe("d0");
  });

  it("対象外（2日前・4日前・過ぎた後）は null", () => {
    expect(milestoneForDaysRemaining(2)).toBeNull();
    expect(milestoneForDaysRemaining(4)).toBeNull();
    expect(milestoneForDaysRemaining(-1)).toBeNull();
  });
});

describe("通知本文の組立", () => {
  const ctx = {
    facilityName: "テスト事業所",
    endsAt: new Date("2026-08-25T00:00:00"),
    monthlyFee: 4000,
  };

  it("d3: 件名と本文に3日後・終了日・月額が入る", () => {
    const { subject, text } = composeTrialReminder("d3", ctx);
    expect(subject).toContain("あと3日");
    expect(text).toContain("3日後の2026年8月25日");
    expect(text).toContain("4,000 円");
    expect(text).toContain("テスト事業所");
  });

  it("d1: 明日終了の表現", () => {
    const { subject, text } = composeTrialReminder("d1", ctx);
    expect(subject).toContain("明日");
    expect(text).toContain("明日2026年8月25日");
  });

  it("d0: 本日終了の表現", () => {
    const { subject, text } = composeTrialReminder("d0", ctx);
    expect(subject).toContain("本日");
    expect(text).toContain("本日2026年8月25日");
  });

  it("manageUrl があれば解約リンク行、無ければ返信案内", () => {
    const withUrl = composeTrialReminder("d3", { ...ctx, manageUrl: "https://billing.example/portal" });
    expect(withUrl.text).toContain("https://billing.example/portal");
    expect(withUrl.text).toContain("解約");

    const withoutUrl = composeTrialReminder("d3", ctx);
    expect(withoutUrl.text).not.toContain("http");
    expect(withoutUrl.text).toContain("ご返信ください");
  });

  it("previewUrl があればプレビュー行が入る", () => {
    const { text } = composeTrialReminder("d0", { ...ctx, previewUrl: "http://localhost:3000/preview/abc" });
    expect(text).toContain("http://localhost:3000/preview/abc");
  });
});
