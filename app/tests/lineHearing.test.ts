import { describe, test, expect } from "vitest";
import {
  STEPS,
  advance,
  isResetCommand,
  type DraftCandidate,
  type HearingDraft,
} from "@/server/line/hearing.js";

const cand = (over: Partial<DraftCandidate> = {}): DraftCandidate => ({
  id: "fac_1",
  name: "ひまわり作業所",
  address: "奈良県奈良市三条通1-1",
  prefecture: "奈良県",
  url: null,
  ...over,
});

describe("advance: 名称入力と収集リスト照合", () => {
  test("候補が無ければ従来どおり既存HPの質問へ進む", () => {
    // Arrange / Act
    const r = advance(STEPS.ASK_NAME, {}, "ひまわり作業所", { candidates: [] });

    // Assert
    expect(r.nextStep).toBe(STEPS.ASK_URL);
    expect(r.draft.name).toBe("ひまわり作業所");
    expect(r.draft.matchedFacilityId).toBeUndefined();
  });

  test("候補が1件なら確認ステップに入り、名称と住所を提示する", () => {
    // Arrange / Act
    const r = advance(STEPS.ASK_NAME, {}, "ひまわり作業所", { candidates: [cand()] });

    // Assert
    expect(r.nextStep).toBe(STEPS.CONFIRM_FACILITY);
    expect(r.draft.candidates).toHaveLength(1);
    expect(r.replies.join("\n")).toContain("ひまわり作業所");
    expect(r.replies.join("\n")).toContain("奈良県奈良市三条通1-1");
  });

  test("候補が複数なら番号付きで提示する", () => {
    // Arrange
    const cands = [cand(), cand({ id: "fac_2", name: "ひまわり作業所 第二" })];

    // Act
    const r = advance(STEPS.ASK_NAME, {}, "ひまわり作業所", { candidates: cands });

    // Assert
    expect(r.nextStep).toBe(STEPS.CONFIRM_FACILITY);
    const text = r.replies.join("\n");
    expect(text).toContain("1.");
    expect(text).toContain("2.");
    expect(text).toContain("0.");
  });
});

describe("advance: 持ち主が確定している事業所は自己申告で紐付けさせない", () => {
  test("紐付け可能な候補が無く保護対象の一致だけなら、運営確認へ回す", () => {
    // Arrange / Act
    const r = advance(STEPS.ASK_NAME, {}, "ジョブタス奈良三条通り事業所", {
      candidates: [],
      protectedMatchCount: 1,
    });

    // Assert
    expect(r.nextStep).toBe(STEPS.AWAITING_STAFF);
    expect(r.draft.matchedFacilityId).toBeUndefined();
    expect(r.escalate?.reason).toContain("ジョブタス奈良三条通り事業所");
    expect(r.triggerGenerate).toBeFalsy();
  });

  test("確認待ち中はヒアリングを進めず、内容を申し送るだけ", () => {
    // Arrange / Act
    const r = advance(STEPS.AWAITING_STAFF, { name: "A" }, "早くしてください");

    // Assert
    expect(r.nextStep).toBe(STEPS.AWAITING_STAFF);
    expect(r.triggerGenerate).toBeFalsy();
    expect(r.escalate?.reason).toContain("早くしてください");
  });

  test("紐付け可能な候補があるときは通常どおり確認に進む（保護件数があっても）", () => {
    // Arrange / Act
    const r = advance(STEPS.ASK_NAME, {}, "ひまわり作業所", {
      candidates: [cand()],
      protectedMatchCount: 2,
    });

    // Assert
    expect(r.nextStep).toBe(STEPS.CONFIRM_FACILITY);
  });
});

describe("advance: 照合の確認", () => {
  const draftWith = (cands: DraftCandidate[]): HearingDraft => ({
    name: "ひまわり作業所",
    candidates: cands,
  });

  test("単一候補に「はい」で既存事業所に紐付く", () => {
    // Arrange / Act
    const r = advance(STEPS.CONFIRM_FACILITY, draftWith([cand()]), "はい");

    // Assert
    expect(r.draft.matchedFacilityId).toBe("fac_1");
    expect(r.nextStep).toBe(STEPS.ASK_URL);
  });

  test("既存データにURLがあれば既存HPの質問を飛ばす", () => {
    // Arrange
    const withUrl = cand({ url: "https://himawari.example.jp" });

    // Act
    const r = advance(STEPS.CONFIRM_FACILITY, draftWith([withUrl]), "はい");

    // Assert
    expect(r.draft.matchedFacilityId).toBe("fac_1");
    expect(r.draft.url).toBe("https://himawari.example.jp");
    expect(r.nextStep).toBe(STEPS.ASK_INFO);
  });

  test("「いいえ」なら紐付けず新規として進む", () => {
    // Arrange / Act
    const r = advance(STEPS.CONFIRM_FACILITY, draftWith([cand()]), "いいえ");

    // Assert
    expect(r.draft.matchedFacilityId).toBeUndefined();
    expect(r.nextStep).toBe(STEPS.ASK_URL);
  });

  test("複数候補は番号で選べる", () => {
    // Arrange
    const cands = [cand(), cand({ id: "fac_2", name: "ひまわり作業所 第二" })];

    // Act
    const r = advance(STEPS.CONFIRM_FACILITY, draftWith(cands), "2");

    // Assert
    expect(r.draft.matchedFacilityId).toBe("fac_2");
    expect(r.nextStep).toBe(STEPS.ASK_URL);
  });

  test("「0」はどれでもない＝新規として進む", () => {
    // Arrange
    const cands = [cand(), cand({ id: "fac_2" })];

    // Act
    const r = advance(STEPS.CONFIRM_FACILITY, draftWith(cands), "0");

    // Assert
    expect(r.draft.matchedFacilityId).toBeUndefined();
    expect(r.nextStep).toBe(STEPS.ASK_URL);
  });

  test("範囲外の番号や意味不明な入力は聞き直す", () => {
    // Arrange
    const cands = [cand()];

    // Act
    const r = advance(STEPS.CONFIRM_FACILITY, draftWith(cands), "9");

    // Assert
    expect(r.nextStep).toBe(STEPS.CONFIRM_FACILITY);
    expect(r.draft.matchedFacilityId).toBeUndefined();
    expect(r.replies.length).toBeGreaterThan(0);
  });
});

describe("advance: 既存HPの有無で聞き方を変える", () => {
  test("URLを答えた人には、乗り換え前提で「新しいHPで伝えたいこと」を聞く", () => {
    // Arrange / Act
    const r = advance(STEPS.ASK_URL, { name: "A" }, "https://example.com");

    // Assert
    expect(r.draft.url).toBe("https://example.com");
    expect(r.replies.join()).toContain("新しいホームページで特に伝えたいこと");
    expect(r.replies.join()).not.toContain("事業所の特徴や主な作業内容");
  });

  test("URLを聞く文面が「情報を正確に反映するため」と伝える（2つ持つ想定にしない）", () => {
    const r = advance(STEPS.ASK_NAME, {}, "ひまわり作業所", { candidates: [] });
    expect(r.replies.join()).toContain("正確に反映");
  });

  test("URLが無い人には従来どおり特徴・作業内容を聞く", () => {
    const r = advance(STEPS.ASK_URL, { name: "A" }, "なし");
    expect(r.draft.url).toBe("");
    expect(r.replies.join()).toContain("事業所の特徴や主な作業内容");
  });
});

describe("advance: 写真とAI画像を別々に聞く", () => {
  test("特徴の質問のあとは写真の質問へ", () => {
    const r = advance(STEPS.ASK_INFO, { name: "A" }, "農作業と手工芸");
    expect(r.nextStep).toBe(STEPS.ASK_PHOTOS);
    expect(r.draft.jobInfo).toBe("農作業と手工芸");
    expect(r.replies.join()).toContain("お写真");
  });

  test("写真の合図のあとはAI画像の要否を聞く", () => {
    const r = advance(STEPS.ASK_PHOTOS, { name: "A" }, "次へ");
    expect(r.nextStep).toBe(STEPS.ASK_AI_IMAGE);
    expect(r.triggerGenerate).toBeFalsy();
  });

  test("写真を送ったうえでAI画像も「はい」なら併用できる", () => {
    // Arrange: onImage が積んだ想定の写真
    const draft = { name: "A", uploadedImageIds: ["img_1"] };

    // Act
    const r = advance(STEPS.ASK_AI_IMAGE, draft, "はい");

    // Assert
    expect(r.draft.useAiImages).toBe(true);
    expect(r.draft.uploadedImageIds).toEqual(["img_1"]);
    expect(r.nextStep).toBe(STEPS.GENERATING);
    expect(r.triggerGenerate).toBe(true);
  });

  test("AI画像が「いいえ」なら生成しない指定で進む", () => {
    const r = advance(STEPS.ASK_AI_IMAGE, { name: "A" }, "いいえ");
    expect(r.draft.useAiImages).toBe(false);
    expect(r.nextStep).toBe(STEPS.GENERATING);
    expect(r.triggerGenerate).toBe(true);
  });
});

describe("advance: 既存の流れを壊さない", () => {

  test("どのステップでも「やり直し」で最初に戻る", () => {
    const r = advance(STEPS.CONFIRM_FACILITY, { name: "A", candidates: [cand()] }, "やり直し");
    expect(r.nextStep).toBe(STEPS.ASK_NAME);
    expect(r.draft).toEqual({});
  });

  test("編集モードからでも「やり直し」でヒアリングに戻る", () => {
    // 生成後（編集モード）の利用者が最初からやり直せること。
    const r = advance(STEPS.EDITING, { name: "A", matchedFacilityId: "fac_1" }, "やり直し");
    expect(r.nextStep).toBe(STEPS.ASK_NAME);
    expect(r.draft).toEqual({});
    expect(r.draft.matchedFacilityId).toBeUndefined();
  });
});

describe("isResetCommand", () => {
  test("やり直し系のみ true", () => {
    expect(isResetCommand("やり直し")).toBe(true);
    expect(isResetCommand("リセット")).toBe(true);
    expect(isResetCommand("最初から")).toBe(true);
    expect(isResetCommand("ひまわり作業所")).toBe(false);
  });
});
