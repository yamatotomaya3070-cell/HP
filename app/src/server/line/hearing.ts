// LINEヒアリングBotの対話ロジック（状態機械）。
// 友だち追加→事業所名→既存HP→求人/会社情報→画像希望 を順に聞き、
// 集まったら Web検索リサーチ＋HP生成を実行してプレビューリンクを返す。
// 生成後は編集モード（自然文→runEdit）。解約時は編集停止＋再契約案内。
//
// 「大きい要求」への備え: AIが操作語彙で対応できない要望は escalate（担当者=運営に通知）する。

import { prisma } from "@/lib/db.js";

/** ヒアリングの手順。 */
export const STEPS = {
  START: "start",
  ASK_NAME: "ask_name",
  ASK_URL: "ask_url",
  ASK_INFO: "ask_info",
  ASK_IMAGE: "ask_image",
  GENERATING: "generating",
  EDITING: "editing",
} as const;
export type Step = (typeof STEPS)[keyof typeof STEPS];

export interface HearingDraft {
  name?: string;
  url?: string; // 既存HP（"なし"可）
  jobInfo?: string; // 求人/会社情報
  imageWish?: string; // 入れたい画像の希望（"AIで生成"可）
  uploadedImageIds?: string[]; // LINEでアップされた画像の mediaAsset id
}

/** 友だち追加時の挨拶＋最初の質問。 */
export function welcomeMessages(): string[] {
  return [
    "友だち追加ありがとうございます🌱\n就労継続支援B型事業所さま向けに、AIがホームページを無料でお作りします。",
    "いくつか教えていただくだけで、サンプルHPを自動作成します。いつでも「やり直し」と送れば最初からやり直せます。",
    "まず、事業所の名称を教えてください。\n（例: ひまわり作業所）",
  ];
}

/** 次に送る質問文（step に対応）。 */
export function questionFor(step: Step): string {
  switch (step) {
    case STEPS.ASK_URL:
      return "ありがとうございます。既存のホームページはありますか？\nあればURLを、なければ「なし」と送ってください。";
    case STEPS.ASK_INFO:
      return "事業所の特徴や主な作業内容、求人・会社情報などがあれば教えてください。\n（例: 農作業と手工芸が中心／送迎あり／未経験歓迎 など。特になければ「おまかせ」と送ってください）";
    case STEPS.ASK_IMAGE:
      return "ホームページに入れたい写真はありますか？\nこのトークに画像を送っていただければ使用します。無ければ「AIで作成」と送ってください（AIが人物なしの雰囲気画像を作ります）。";
    default:
      return "";
  }
}

interface StepResult {
  nextStep: Step;
  draft: HearingDraft;
  /** ユーザーへ返す文言。 */
  replies: string[];
  /** true なら生成を実行する合図。 */
  triggerGenerate?: boolean;
}

/** テキスト入力を現在ステップに適用し、次ステップと返信を決める。 */
export function advance(step: Step, draft: HearingDraft, text: string): StepResult {
  const t = text.trim();

  // どのステップでも「やり直し」で最初へ。
  if (/^(やり直し|リセット|最初から)$/.test(t)) {
    return { nextStep: STEPS.ASK_NAME, draft: {}, replies: ["最初からやり直します。\n事業所の名称を教えてください。"] };
  }

  switch (step) {
    case STEPS.START:
    case STEPS.ASK_NAME: {
      if (!t) return { nextStep: STEPS.ASK_NAME, draft, replies: ["事業所の名称を教えてください。"] };
      const d = { ...draft, name: t };
      return { nextStep: STEPS.ASK_URL, draft: d, replies: [questionFor(STEPS.ASK_URL)] };
    }
    case STEPS.ASK_URL: {
      const url = /^(なし|ない|無し)$/.test(t) ? "" : t;
      const d = { ...draft, url };
      return { nextStep: STEPS.ASK_INFO, draft: d, replies: [questionFor(STEPS.ASK_INFO)] };
    }
    case STEPS.ASK_INFO: {
      const info = /^(おまかせ|お任せ|特になし|なし)$/.test(t) ? "" : t;
      const d = { ...draft, jobInfo: info };
      return { nextStep: STEPS.ASK_IMAGE, draft: d, replies: [questionFor(STEPS.ASK_IMAGE)] };
    }
    case STEPS.ASK_IMAGE: {
      const d = { ...draft, imageWish: t };
      return {
        nextStep: STEPS.GENERATING,
        draft: d,
        replies: [
          "ありがとうございます！内容を確認して、ホームページを作成します🛠️\n1〜2分ほどお待ちください…",
        ],
        triggerGenerate: true,
      };
    }
    default:
      // 編集モード等はここでは扱わない（呼び出し側で分岐）。
      return { nextStep: step, draft, replies: [] };
  }
}

/** LINE userId のセッションを取得（無ければ作成）。 */
export async function getOrCreateSession(lineUserId: string, displayName?: string) {
  const existing = await prisma.lineUser.findUnique({ where: { lineUserId } });
  if (existing) return existing;
  return prisma.lineUser.create({
    data: { lineUserId, displayName: displayName ?? null, step: STEPS.START },
  });
}
