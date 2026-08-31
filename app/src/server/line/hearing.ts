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
  CONFIRM_FACILITY: "confirm_facility",
  AWAITING_STAFF: "awaiting_staff",
  ASK_URL: "ask_url",
  ASK_INFO: "ask_info",
  ASK_PHOTOS: "ask_photos",
  ASK_AI_IMAGE: "ask_ai_image",
  GENERATING: "generating",
  EDITING: "editing",
} as const;
export type Step = (typeof STEPS)[keyof typeof STEPS];

/** 収集済みリストの照合候補（draft に保存して番号選択を解決する）。 */
export interface DraftCandidate {
  id: string;
  name: string;
  address?: string | null;
  prefecture?: string | null;
  url?: string | null;
}

export interface HearingDraft {
  name?: string;
  url?: string; // 既存HP（"なし"可）
  jobInfo?: string; // 事業所からの申告（既存HPがある場合は「現状との違い・変えたい点」）
  useAiImages?: boolean; // AIで雰囲気画像を生成するか（写真アップと併用可）
  uploadedImageIds?: string[]; // LINEでアップされた画像の mediaAsset id
  candidates?: DraftCandidate[]; // 照合で提示した候補
  matchedFacilityId?: string; // 確認が取れた既存事業所
}

/** advance に外から渡す文脈（DB照合結果など。純粋性を保つため引数で受ける）。 */
export interface AdvanceContext {
  /** 名称入力への応答時、収集リストから見つかった候補（自己申告で紐付け可能なもののみ）。 */
  candidates?: DraftCandidate[];
  /** 名称は一致したが持ち主が確定していて自動紐付けできない件数。 */
  protectedMatchCount?: number;
}

/** 友だち追加時の挨拶＋最初の質問。 */
export function welcomeMessages(): string[] {
  return [
    "友だち追加ありがとうございます🌱\n就労継続支援B型事業所さま向けに、AIがホームページを無料でお作りします。",
    "いくつか教えていただくだけで、サンプルHPを自動作成します。いつでも「やり直し」と送れば最初からやり直せます。",
    "まず、事業所の名称を教えてください。\n（例: ひまわり作業所）",
  ];
}

/**
 * 次に送る質問文。
 *
 * URLを聞く目的は「事業所の実際の情報を確認するため」であって、既存サイトを残す前提ではない。
 * この商品は今のホームページの“乗り換え”なので、「現在のサイトと併用する」と受け取れる言い方
 * （2つ持つ想定の文言）は使わない。あくまで正確な情報源として参照する、と伝える。
 */
export function questionFor(step: Step, opts: { hasUrl?: boolean } = {}): string {
  switch (step) {
    case STEPS.ASK_URL:
      return "ありがとうございます。現在お使いのホームページはありますか？\n事業所の情報を正確に反映したいので、あればURLを教えてください（内容を確認させていただきます）。\n無ければ「なし」と送ってください。";
    case STEPS.ASK_INFO:
      return opts.hasUrl
        ? "ありがとうございます。サイトから事業所の情報を確認します。\n新しいホームページで特に伝えたいことや、今のサイトに載っていない最新の情報があれば教えてください。\n（例: 送迎を始めた／作業内容が変わった など。特になければ「おまかせ」と送ってください）"
        : "事業所の特徴や主な作業内容、求人・会社情報などがあれば教えてください。\n（例: 農作業と手工芸が中心／送迎あり／未経験歓迎 など。特になければ「おまかせ」と送ってください）";
    case STEPS.ASK_PHOTOS:
      return "ホームページに載せたいお写真はありますか？\nこのトークに画像を送ってください（何枚でも可）。\n送り終わったら「次へ」、写真が無ければ「なし」と送ってください。";
    case STEPS.ASK_AI_IMAGE:
      return "AIで雰囲気の画像も作成しますか？\n「はい」または「いいえ」でお答えください。\n（人物は写さず、作業風景や室内などのイメージ画像を作ります。お写真と併用もできます）";
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
  /** 運営の確認が必要な合図（本人性が自己申告では担保できない場合など）。 */
  escalate?: { reason: string };
}

/** 「やり直し」系の指示か。 */
export function isResetCommand(text: string): boolean {
  return /^(やり直し|リセット|最初から)$/.test(text.trim());
}

/** 候補を1行で表す（名称＋住所）。 */
function candidateLabel(c: DraftCandidate): string {
  const place = c.address || c.prefecture || "";
  return place ? `${c.name}（${place}）` : c.name;
}

/** 照合候補の確認メッセージを組み立てる。 */
export function confirmMessage(candidates: readonly DraftCandidate[]): string {
  if (candidates.length === 1) {
    return [
      `${candidateLabel(candidates[0])}`,
      "",
      "こちらの事業所でお間違いないですか？",
      "「はい」または「いいえ」でお答えください。",
    ].join("\n");
  }
  const lines = candidates.map((c, i) => `${i + 1}. ${candidateLabel(c)}`);
  return [
    `似た名称の事業所が${candidates.length}件見つかりました。`,
    "番号でお選びください。",
    "",
    ...lines,
    "0. どれでもない（新しく作成します）",
  ].join("\n");
}

/** 確認後、既存HPのURLが分かっていれば質問を飛ばす。 */
function afterMatch(draft: HearingDraft, matched: DraftCandidate): StepResult {
  const d: HearingDraft = {
    ...draft,
    matchedFacilityId: matched.id,
    candidates: undefined,
  };
  const intro = `ありがとうございます。${matched.name}ですね。`;

  if (matched.url) {
    return {
      nextStep: STEPS.ASK_INFO,
      draft: { ...d, url: matched.url },
      replies: [intro, questionFor(STEPS.ASK_INFO, { hasUrl: true })],
    };
  }
  return { nextStep: STEPS.ASK_URL, draft: d, replies: [intro, questionFor(STEPS.ASK_URL)] };
}

/** テキスト入力を現在ステップに適用し、次ステップと返信を決める。 */
export function advance(
  step: Step,
  draft: HearingDraft,
  text: string,
  ctx: AdvanceContext = {},
): StepResult {
  const t = text.trim();

  // どのステップでも「やり直し」で最初へ。
  if (isResetCommand(t)) {
    return { nextStep: STEPS.ASK_NAME, draft: {}, replies: ["最初からやり直します。\n事業所の名称を教えてください。"] };
  }

  switch (step) {
    case STEPS.START:
    case STEPS.ASK_NAME: {
      if (!t) return { nextStep: STEPS.ASK_NAME, draft, replies: ["事業所の名称を教えてください。"] };
      const d = { ...draft, name: t };

      // 収集リストに候補があれば、本人に確認して既存データ（住所/TEL/法人名）に紐付ける。
      const candidates = ctx.candidates ?? [];
      if (candidates.length > 0) {
        return {
          nextStep: STEPS.CONFIRM_FACILITY,
          draft: { ...d, candidates },
          replies: [confirmMessage(candidates)],
        };
      }

      // 名称は一致するが持ち主が確定している場合は、自己申告で紐付けず運営の確認に回す。
      if ((ctx.protectedMatchCount ?? 0) > 0) {
        return {
          nextStep: STEPS.AWAITING_STAFF,
          draft: d,
          replies: [
            "ありがとうございます。ご入力の事業所は、すでにご登録の確認が必要な状態です🙇",
            "誤ってお客様のホームページを書き換えてしまわないよう、担当者が確認のうえご連絡いたします。恐れ入りますが少々お待ちください。",
          ],
          escalate: { reason: `登録済み事業所への紐付け要求: 「${t}」` },
        };
      }

      return { nextStep: STEPS.ASK_URL, draft: d, replies: [questionFor(STEPS.ASK_URL)] };
    }
    case STEPS.AWAITING_STAFF: {
      // 運営確認待ち。勝手に進めず、内容だけ申し送る。
      return {
        nextStep: STEPS.AWAITING_STAFF,
        draft,
        replies: ["担当者に申し送りいたしました。追ってご連絡いたしますので、少々お待ちください🙇"],
        escalate: { reason: `確認待ち中のメッセージ: ${t.slice(0, 200)}` },
      };
    }
    case STEPS.CONFIRM_FACILITY: {
      const candidates = draft.candidates ?? [];

      // 明示的な否定・0 は「どれでもない」＝新規作成。
      if (/^(いいえ|no|違う|ちがう|0|どれでもない|該当なし|ない)$/i.test(t)) {
        return {
          nextStep: STEPS.ASK_URL,
          draft: { ...draft, candidates: undefined },
          replies: ["承知しました。新しくお作りします。", questionFor(STEPS.ASK_URL)],
        };
      }

      // 単一候補への肯定。
      if (candidates.length === 1 && /^(はい|yes|ok|そう|そうです|はいそうです)$/i.test(t)) {
        return afterMatch(draft, candidates[0]);
      }

      // 番号での選択。
      const n = Number.parseInt(t, 10);
      if (Number.isInteger(n) && n >= 1 && n <= candidates.length) {
        return afterMatch(draft, candidates[n - 1]);
      }

      // 解釈できない入力は聞き直す。
      return {
        nextStep: STEPS.CONFIRM_FACILITY,
        draft,
        replies: [
          candidates.length === 1
            ? "恐れ入ります、「はい」か「いいえ」でお答えください。"
            : "恐れ入ります、番号でお選びください（どれでもない場合は「0」）。",
          confirmMessage(candidates),
        ],
      };
    }
    case STEPS.ASK_URL: {
      const url = /^(なし|ない|無し)$/.test(t) ? "" : t;
      const d = { ...draft, url };
      return {
        nextStep: STEPS.ASK_INFO,
        draft: d,
        replies: [questionFor(STEPS.ASK_INFO, { hasUrl: Boolean(url) })],
      };
    }
    case STEPS.ASK_INFO: {
      const info = /^(おまかせ|お任せ|特になし|なし)$/.test(t) ? "" : t;
      const d = { ...draft, jobInfo: info };
      return { nextStep: STEPS.ASK_PHOTOS, draft: d, replies: [questionFor(STEPS.ASK_PHOTOS)] };
    }
    case STEPS.ASK_PHOTOS: {
      // 画像そのものは onImage が draft に積む。ここは「送り終わった/無い」の合図を受ける。
      return {
        nextStep: STEPS.ASK_AI_IMAGE,
        draft,
        replies: [questionFor(STEPS.ASK_AI_IMAGE)],
      };
    }
    case STEPS.ASK_AI_IMAGE: {
      const useAiImages = !/^(いいえ|いらない|不要|なし|no)$/i.test(t);
      const d = { ...draft, useAiImages };
      return {
        nextStep: STEPS.GENERATING,
        draft: d,
        replies: [
          useAiImages
            ? "ありがとうございます！内容を確認して、画像も作りながらホームページを作成します🛠️\n1〜2分ほどお待ちください…"
            : "承知しました。お預かりした内容でホームページを作成します🛠️\n少々お待ちください…",
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
