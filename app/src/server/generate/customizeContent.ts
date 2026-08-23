// 事業所ごとに「その企業らしい」HP内容をAIで生成する（要望1: 画一的でない生成）。
// 収集データは連絡先のみのため、名称・法人名・地域（＋あれば既存HP本文）から
// 業務内容を推定し、サービス/一日の流れ/紹介文/バッジ/画像プロンプトを提案する。
//
// 重要: これは「AIの推定サンプル」であり事実の断定ではない。事業所が返信で修正する前提。
//   → 具体的な数値（工賃/営業時間等）は生成しない（unconfirmed のまま）。
//   → 画像プロンプトは人物なし（imageGenerator 側でも二重にガード）。

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ICON_KEYS } from "@/lib/siteData.js";

export interface FacilitySeed {
  name: string;
  corpName?: string | null;
  address?: string | null;
  prefecture?: string | null;
  /** 既存HPから抽出したテキスト（あれば精度が上がる）。 */
  siteText?: string | null;
}

/** AI出力（この事業所らしいHP内容）。 */
export const customContentSchema = z.object({
  /** ヒーローのキャッチコピー（事実断定を避ける）。 */
  catchCopy: z.string().max(80),
  /** 紹介文（段落）。 */
  aboutBody: z.array(z.string().max(400)).min(1).max(6),
  /** ヒーロー下のバッジ。 */
  highlights: z
    .array(z.object({ icon: z.enum(ICON_KEYS), label: z.string().max(20) }))
    .max(6),
  /** できること（サービス）カード。imagePrompt は人物なしの英語シーン。 */
  services: z
    .array(
      z.object({
        title: z.string().max(30),
        description: z.string().max(160),
        icon: z.enum(ICON_KEYS),
        imagePrompt: z.string().max(400),
      }),
    )
    .min(1)
    .max(8),
  /** 一日の流れ（ステップ）。時刻は一般的な目安。 */
  dailyFlow: z
    .array(
      z.object({
        time: z.string().max(10),
        title: z.string().max(20),
        description: z.string().max(120),
        icon: z.enum(ICON_KEYS),
      }),
    )
    .max(8),
  /** ヒーロー用の画像プロンプト（人物なしの英語シーン）。 */
  heroImagePrompt: z.string().max(300),
});
export type CustomContent = z.infer<typeof customContentSchema>;

function buildPrompt(seed: FacilitySeed): string {
  const facts = [
    `名称: ${seed.name}`,
    seed.corpName ? `法人名: ${seed.corpName}` : "",
    seed.prefecture ? `地域: ${seed.prefecture}` : "",
    seed.address ? `住所: ${seed.address}` : "",
    seed.siteText ? `既存サイト抜粋:\n${seed.siteText.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "あなたは就労継続支援B型事業所のHPを作る編集者です。",
    "以下の事業所情報から、この事業所「らしい」HPの内容を推定して提案してください。",
    "名称・法人名から業務内容を推測します（例: 「〜ファーム/農園」→農作業・野菜づくり、「〜ベーカリー」→パン製造、「〜キッチン/食堂」→調理・カフェ、判断材料が無ければ軽作業・手工芸・PC作業の一般構成）。",
    "",
    "# 厳守",
    "- これはAIの推定サンプル。事実の断定はしない（工賃額・営業時間・送迎有無などの具体的数値/可否は書かない）。",
    "- 紹介文・サービス説明は、断定を避けた やわらかい敬体（です・ます）。誇大表現（最安・No.1・必ず等）禁止。",
    "- icon は次のいずれか: " + ICON_KEYS.join(", "),
    "  目安: 農作業=leaf, 調理/パン=lunch, 軽作業=box, 手工芸=scissors, PC=laptop, 朝礼/面談=people, 作業=pencil, 終礼=flag, 見学=calendar, 送迎=bus, 支援=heart, 得意=star, 時間=clock",
    "- imagePrompt / heroImagePrompt は英語で、その業務が伝わる情景。**人物を示す語（people, person, worker, staff, hands 等）を一切書かない**。作物・道具・作業台・室内・畑・自然の情景のみを描写する。文字やロゴも入れない。",
    "",
    "# 出力（JSONのみ・前後に文章やコードフェンス禁止）",
    '{"catchCopy":"","aboutBody":["",""],"highlights":[{"icon":"","label":""}],"services":[{"title":"","description":"","icon":"","imagePrompt":""}],"dailyFlow":[{"time":"10:00","title":"","description":"","icon":""}],"heroImagePrompt":""}',
    "",
    "# 事業所情報",
    facts,
  ].join("\n");
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const s = body.indexOf("{");
  const e = body.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) throw new Error("JSONが見つかりません");
  return body.slice(s, e + 1);
}

export class CustomContentError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "api" | "bad_output",
  ) {
    super(message);
    this.name = "CustomContentError";
  }
}

/** 事業所らしいHP内容をAIで生成する。GEMINI_API_KEY が必要。 */
export async function generateCustomContent(
  seed: FacilitySeed,
): Promise<CustomContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new CustomContentError("GEMINI_API_KEY が未設定です。", "not_configured");
  }
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  let raw: string;
  try {
    const res = await ai.models.generateContent({
      model,
      contents: buildPrompt(seed),
      config: { responseMimeType: "application/json" },
    });
    raw = res.text ?? "";
  } catch (e) {
    throw new CustomContentError(
      `内容生成APIの呼び出しに失敗しました: ${(e as Error).message}`,
      "api",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new CustomContentError("生成結果をJSONとして解釈できません。", "bad_output");
  }
  const result = customContentSchema.safeParse(parsed);
  if (!result.success) {
    throw new CustomContentError(
      `生成結果がスキーマに適合しません: ${result.error.issues[0]?.message ?? ""}`,
      "bad_output",
    );
  }
  return result.data;
}
