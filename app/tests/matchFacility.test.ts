import { describe, test, expect } from "vitest";
import {
  facilityNameKey,
  stripCorpPrefix,
  searchTerms,
  candidateScore,
  rankCandidates,
} from "@/server/line/matchFacility.js";

describe("facilityNameKey", () => {
  test("法人格・空白・全角の揺れを吸収する", () => {
    // Arrange / Act / Assert
    expect(facilityNameKey("株式会社ひまわり作業所")).toBe("ひまわり作業所");
    expect(facilityNameKey("ひまわり 作業所")).toBe("ひまわり作業所");
    expect(facilityNameKey("特定非営利活動法人　ひまわり作業所")).toBe("ひまわり作業所");
    expect(facilityNameKey("社会福祉法人ひまわり作業所")).toBe("ひまわり作業所");
  });

  test("中黒・括弧などの記号を落とす", () => {
    expect(facilityNameKey("ひまわり・作業所")).toBe("ひまわり作業所");
    expect(facilityNameKey("ひまわり作業所（奈良）")).toBe("ひまわり作業所奈良");
  });

  test("null/undefined/空は空文字", () => {
    expect(facilityNameKey(null)).toBe("");
    expect(facilityNameKey(undefined)).toBe("");
    expect(facilityNameKey("   ")).toBe("");
  });
});

describe("stripCorpPrefix", () => {
  test("表示用の見た目を保ったまま法人格だけ落とす", () => {
    expect(stripCorpPrefix("合同会社絆ひまわり")).toBe("絆ひまわり");
    expect(stripCorpPrefix("ひまわり作業所")).toBe("ひまわり作業所");
  });
});

describe("searchTerms", () => {
  test("原文・法人格除去・空白除去・先頭語を検索語に含める", () => {
    // Arrange / Act
    const terms = searchTerms("株式会社ひまわり 作業所");

    // Assert
    expect(terms).toContain("株式会社ひまわり 作業所");
    expect(terms).toContain("ひまわり 作業所");
    expect(terms).toContain("ひまわり作業所");
    // 重複が無いこと
    expect(new Set(terms).size).toBe(terms.length);
  });

  test("短すぎる入力は検索語を作らない", () => {
    expect(searchTerms("あ")).toEqual([]);
    expect(searchTerms("")).toEqual([]);
  });
});

describe("candidateScore", () => {
  test("完全一致 > 前方一致 > 部分一致 の順にスコアが高い", () => {
    // Arrange
    const cand = { name: "ひまわり作業所", corpName: null };

    // Act
    const exact = candidateScore("ひまわり作業所", cand);
    const prefix = candidateScore("ひまわり", cand);
    const partial = candidateScore("作業所", cand);

    // Assert
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
  });

  test("法人名側の一致も拾う", () => {
    const cand = { name: "第二事業所", corpName: "社会福祉法人ひまわり会" };
    expect(candidateScore("ひまわり会", cand)).toBeGreaterThan(0);
  });

  test("無関係な名称は0点", () => {
    expect(candidateScore("さくら工房", { name: "ひまわり作業所", corpName: null })).toBe(0);
  });
});

describe("rankCandidates", () => {
  test("スコア順に並べ、0点は除外する", () => {
    // Arrange
    const rows = [
      { name: "さくら工房", corpName: null },
      { name: "ひまわり作業所 第二", corpName: null },
      { name: "ひまわり作業所", corpName: null },
    ];

    // Act
    const ranked = rankCandidates("ひまわり作業所", rows);

    // Assert
    expect(ranked.map((r) => r.name)).toEqual(["ひまわり作業所", "ひまわり作業所 第二"]);
  });

  test("候補が無ければ空配列", () => {
    expect(rankCandidates("ひまわり", [])).toEqual([]);
  });
});
