// 事業所の「実際の情報」をWeb検索でリサーチする（Gemini の Google 検索グラウンディング）。
// 収集データは連絡先のみのため、名称・法人名・住所・URLから公式サイト/掲載情報を検索し、
// 実際の作業内容・サービス・特徴を要約テキストで返す。generateCustomContent の siteText に渡す。
//
// 事実性: 「分からない点は推測せず情報なしと書く」よう指示。得られた要約はあくまで参考情報で、
//   具体的な数値（工賃額・営業時間）は details には confirmed 化せず、事業所の返信で確定する。

import { GoogleGenAI } from "@google/genai";

export interface FacilityResearchSeed {
  name: string;
  corpName?: string | null;
  address?: string | null;
  prefecture?: string | null;
  url?: string | null;
  /** 事業所本人の申告（検索対象を絞る手掛かりになる）。 */
  ownerNotes?: string | null;
}

export interface ResearchResult {
  /** 実情報の要約（見つからなければ空文字）。 */
  summary: string;
  /** 参照したソースURL。 */
  sources: string[];
}

/** Web検索で事業所の実情報を要約する。失敗時は空を返す（生成は続行可能）。 */
export async function researchFacility(
  seed: FacilityResearchSeed,
): Promise<ResearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { summary: "", sources: [] };

  const model = process.env.RESEARCH_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  const facts = [
    `名称: ${seed.name}`,
    seed.corpName ? `法人名: ${seed.corpName}` : "",
    seed.prefecture ? `地域: ${seed.prefecture}` : "",
    seed.address ? `住所: ${seed.address}` : "",
    seed.url ? `公式サイト: ${seed.url}` : "",
    seed.ownerNotes ? `事業所からの申告（照合の手掛かり）: ${seed.ownerNotes.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "次の就労継続支援B型事業所について、公式サイトや掲載情報（LITALICO仕事ナビ等）を検索し、",
    "実際の内容を日本語で簡潔にまとめてください。",
    "- 作業内容（例: 組み立て・検品・農作業・調理 など具体的に）",
    "- 提供サービス（送迎・昼食・支援体制など）",
    "- 事業所の特徴・雰囲気",
    "- アクセス（最寄駅など）",
    "分からない点は推測せず「情報なし」と書くこと。誇張しないこと。",
    "",
    facts,
  ].join("\n");

  try {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const summary = (res.text ?? "").trim();
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks
      .map((c) => c.web?.uri)
      .filter((u): u is string => typeof u === "string")
      .slice(0, 8);
    return { summary, sources };
  } catch {
    // 検索失敗時は推定生成にフォールバック
    return { summary: "", sources: [] };
  }
}
