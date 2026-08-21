// AI画像生成の抽象化（成果物B / 方針=「事業所アップロード＋AI雰囲気画像の併用」）。
// 重要な倫理ガード: 実在しない“障害のある利用者らしき人物”を生成しない。
//   → 人物・顔・ポートレートを要求するプロンプトは assertNoPeople で拒否する。
//   → negativePrompt でも顔/実在人物/ロゴ/文字を常に抑制する。
// 生成できるのは「作業スペース/道具/手工芸の作品/明るい室内/植物・自然光」等の雰囲気画像のみ。

import { GoogleGenAI } from "@google/genai";

/** 生成できる雰囲気画像の種類（人物を含まない）。 */
export const ATMOSPHERE_KINDS = [
  "workspace", // 作業スペース・机まわり
  "tools", // 道具・素材・文具
  "craft", // 手工芸の完成品・作品
  "interior", // 明るく清潔な室内
  "nature", // 観葉植物・自然光・窓辺
] as const;
export type AtmosphereKind = (typeof ATMOSPHERE_KINDS)[number];

export interface GenerateImageSpec {
  kind: AtmosphereKind;
  /** 追加の情景メモ（任意・人物語は拒否される）。 */
  extra?: string;
  /** 画像アスペクト比。既定 4:3。 */
  aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
}

export interface GeneratedImageBytes {
  bytes: Uint8Array;
  contentType: string;
}

export interface ImageGenerator {
  generate(spec: GenerateImageSpec): Promise<GeneratedImageBytes>;
}

export class ImageGeneratorError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "rejected_people" | "blocked" | "empty" | "api",
  ) {
    super(message);
    this.name = "ImageGeneratorError";
  }
}

/** 人物・顔・ポートレートを要求する語（生成を拒否する）。 */
const PEOPLE_TERMS = [
  "portrait",
  "face",
  "person",
  "people",
  "man",
  "woman",
  "boy",
  "girl",
  "child",
  "kid",
  "staff",
  "顔",
  "人物",
  "似顔",
  "利用者",
  "スタッフ",
  "職員",
  "男性",
  "女性",
  "子供",
  "子ども",
  "笑顔",
];

/** プロンプトに人物要求が含まれていれば拒否する（倫理ガード）。 */
export function assertNoPeople(text: string): void {
  const lower = text.toLowerCase();
  const hit = PEOPLE_TERMS.find((t) => lower.includes(t.toLowerCase()));
  if (hit) {
    throw new ImageGeneratorError(
      `人物を含む画像の生成は行いません（検出語: 「${hit}」）。作業風景の道具・作品・室内など人物なしの雰囲気画像をご指定ください。`,
      "rejected_people",
    );
  }
}

/** 種別ごとの、人物を含まない情景描写。 */
const KIND_SCENE: Record<AtmosphereKind, string> = {
  workspace:
    "a tidy, welcoming work table in a small Japanese community workshop, neatly arranged materials and simple hand tools, soft natural daylight",
  tools:
    "a close-up still life of simple craft tools and materials — scissors, tape, small boxes, colored paper — arranged neatly on a light wooden desk",
  craft:
    "a still life of gentle handmade craft items — accessories, small woven goods, folded paper — displayed on a clean table",
  interior:
    "a bright, clean and calm room interior of a small welfare workspace, light wood furniture, large windows, soft daylight",
  nature:
    "potted green plants by a sunlit window, calm and warm atmosphere, soft bokeh background",
};

/** 雰囲気画像用のプロンプトを組み立てる（純関数）。extra に人物語があれば拒否。 */
export function buildAtmospherePrompt(kind: AtmosphereKind, extra?: string): string {
  const base = KIND_SCENE[kind];
  const style =
    "warm, gentle, hopeful mood, soft green and orange tones, documentary photography, shallow depth of field, no people, no text, no logos";
  const extraPart = extra?.trim() ? ` ${extra.trim()}.` : "";
  if (extraPart) assertNoPeople(extraPart);
  return `${base}.${extraPart} Style: ${style}.`;
}

/** 常に抑制する要素（顔・実在人物・文字・ロゴ）。 */
const NEGATIVE_PROMPT =
  "human faces, identifiable people, portraits, crowds, text, letters, watermark, logo, brand, deformed hands";

/** Gemini (Imagen) による生成。GEMINI_API_KEY と画像モデルが必要。 */
class GeminiImageGenerator implements ImageGenerator {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(spec: GenerateImageSpec): Promise<GeneratedImageBytes> {
    const prompt = buildAtmospherePrompt(spec.kind, spec.extra);
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    let res;
    try {
      res = await ai.models.generateImages({
        model: this.model,
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: spec.aspectRatio ?? "4:3",
          negativePrompt: NEGATIVE_PROMPT,
          includeRaiReason: true,
        },
      });
    } catch (e) {
      throw new ImageGeneratorError(
        `画像生成APIの呼び出しに失敗しました: ${(e as Error).message}`,
        "api",
      );
    }
    const first = res.generatedImages?.[0];
    if (first?.raiFilteredReason) {
      throw new ImageGeneratorError(
        `安全フィルタにより生成がブロックされました: ${first.raiFilteredReason}`,
        "blocked",
      );
    }
    const b64 = first?.image?.imageBytes;
    if (!b64) {
      throw new ImageGeneratorError("生成結果に画像データがありません。", "empty");
    }
    return { bytes: new Uint8Array(Buffer.from(b64, "base64")), contentType: "image/png" };
  }
}

/** 環境に応じて画像ジェネレータを返す。未設定なら明示エラー。 */
export function getImageGenerator(): ImageGenerator {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new ImageGeneratorError(
      "GEMINI_API_KEY が未設定です（AI画像生成にはキーが必要）。",
      "not_configured",
    );
  }
  const model = process.env.IMAGE_MODEL ?? "imagen-4.0-generate-001";
  return new GeminiImageGenerator(apiKey, model);
}
