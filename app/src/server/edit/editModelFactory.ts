// AI編集モデルのファクトリ。プロバイダ選択を一箇所に集約する。
// 選択規則（優先順）:
//   1. EDIT_PROVIDER="gemini" | "claude" が明示されていればそれに従う
//   2. 未指定なら、鍵が設定されている方を採用（両方あれば gemini を優先）
//   3. いずれの鍵も無ければ not_configured を投げる（呼び出し側が案内できる）

import { type EditModel, EditModelError } from "./editModel.js";
import { ClaudeEditModel } from "./claudeModel.js";
import { GeminiEditModel } from "./geminiModel.js";

export type EditProvider = "gemini" | "claude";

/** 明示指定 or 鍵の有無からプロバイダを決定する。 */
export function resolveEditProvider(): EditProvider {
  const explicit = process.env.EDIT_PROVIDER?.trim().toLowerCase();
  if (explicit === "gemini" || explicit === "claude") {
    return explicit;
  }
  if (explicit) {
    throw new EditModelError(
      `EDIT_PROVIDER の値が不正です: "${explicit}"（gemini | claude のいずれか）`,
      "not_configured",
    );
  }
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  throw new EditModelError(
    "AIの鍵が未設定です（GEMINI_API_KEY か ANTHROPIC_API_KEY のいずれかが必要です）",
    "not_configured",
  );
}

/** 環境に応じた EditModel を生成する。鍵未設定は EditModelError(not_configured)。 */
export function createEditModel(): EditModel {
  return resolveEditProvider() === "gemini"
    ? new GeminiEditModel()
    : new ClaudeEditModel();
}
