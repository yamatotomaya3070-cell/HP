// Claude 実装の EditModel。ANTHROPIC_API_KEY が必要。
// 既定モデルは claude-opus-5、adaptive thinking。安全分類の拒否(refusal)を明示的に扱う。

import Anthropic from "@anthropic-ai/sdk";
import {
  type EditModel,
  type ProposeEditInput,
  EditModelError,
  buildSystemPrompt,
  buildUserMessage,
  parseProposal,
} from "./editModel.js";
import { type EditProposal } from "@/lib/editOps.js";

const DEFAULT_MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

export class ClaudeEditModel implements EditModel {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new EditModelError(
        "ANTHROPIC_API_KEY が未設定です（AI編集を実行できません）",
        "not_configured",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async proposeEdits(input: ProposeEditInput): Promise<EditProposal> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserMessage(input) }],
      });
    } catch (e) {
      throw new EditModelError(
        `Claude API 呼び出しに失敗しました: ${(e as Error).message}`,
        "api",
      );
    }

    if (response.stop_reason === "refusal") {
      throw new EditModelError(
        "安全分類により編集提案が拒否されました",
        "refused",
      );
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      throw new EditModelError("モデルがテキストを返しませんでした", "bad_output");
    }
    return parseProposal(text);
  }
}
