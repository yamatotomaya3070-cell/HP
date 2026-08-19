// Gemini 実装の EditModel。GEMINI_API_KEY が必要。
// 既定モデルは gemini-2.5-flash。responseMimeType=application/json で構造化出力を安定させ、
// 安全ブロック(promptFeedback.blockReason / finishReason=SAFETY)を明示的に拒否として扱う。

import { GoogleGenAI, FinishReason } from "@google/genai";
import {
  type EditModel,
  type ProposeEditInput,
  EditModelError,
  buildSystemPrompt,
  buildUserMessage,
  parseProposal,
} from "./editModel.js";
import { type EditProposal } from "@/lib/editOps.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 4096;

export class GeminiEditModel implements EditModel {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new EditModelError(
        "GEMINI_API_KEY が未設定です（AI編集を実行できません）",
        "not_configured",
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async proposeEdits(input: ProposeEditInput): Promise<EditProposal> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: buildUserMessage(input),
        config: {
          systemInstruction: buildSystemPrompt(),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // JSON のみを返させ、パース失敗を減らす（parseProposal 側でも再検証）。
          responseMimeType: "application/json",
        },
      });
    } catch (e) {
      throw new EditModelError(
        `Gemini API 呼び出しに失敗しました: ${(e as Error).message}`,
        "api",
      );
    }

    // プロンプト段階の安全ブロック（候補が生成されない）。
    if (response.promptFeedback?.blockReason) {
      throw new EditModelError(
        `安全分類により編集提案が拒否されました: ${response.promptFeedback.blockReason}`,
        "refused",
      );
    }

    // 出力段階の安全停止。
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.RECITATION) {
      throw new EditModelError(
        `安全分類により編集提案が拒否されました: ${finishReason}`,
        "refused",
      );
    }

    const text = response.text?.trim();
    if (!text) {
      throw new EditModelError("モデルがテキストを返しませんでした", "bad_output");
    }
    return parseProposal(text);
  }
}
