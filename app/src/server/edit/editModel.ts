// AI編集モデルの抽象化。メール版(Phase 5)/エディタ版(Phase 4)が共有する。
// モデルは「現在の構造化データ＋事業所の自然文指示」から、ホワイトリスト操作(EditOp)の
// 提案を返す。実際の適用・検証は applyOps が担う（モデル出力は信用しない）。

import {
  type EditProposal,
  editProposalSchema,
  OP_NAMES,
} from "@/lib/editOps.js";
import { type SiteData, THEME_PRESETS, SECTIONS } from "@/lib/siteData.js";

export interface ProposeEditInput {
  /** 現在の構造化データ。 */
  currentData: SiteData;
  /** 事業所からの自然文の編集指示（メール本文 or チャット）。 */
  instruction: string;
}

export interface EditModel {
  proposeEdits(input: ProposeEditInput): Promise<EditProposal>;
}

/** モデル呼び出しに関わる失敗（未設定・拒否・不正出力）。握りつぶさず上位へ。 */
export class EditModelError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "refused" | "bad_output" | "api",
  ) {
    super(message);
    this.name = "EditModelError";
  }
}

/** モデルへ渡すシステムプロンプト。事実捏造を禁止し、操作語彙に限定する。 */
export function buildSystemPrompt(): string {
  return [
    "あなたは就労継続支援B型事業所のホームページを編集するアシスタントです。",
    "事業所からの日本語の指示を、許可された操作(EditOp)の列に変換します。",
    "",
    "# 厳守事項",
    "- 出力できるのは次の操作のみ: " + OP_NAMES.join(", "),
    "- テンプレートのコードやレイアウト以外の項目は変更できません。",
    "- 事実(住所/電話/営業時間/送迎/昼食/工賃/サービス内容など)は、指示に明示された内容だけを設定してください。",
    "  推測や創作で事実を埋めてはいけません。指示に無い事実は変更しないこと。",
    "- 見出し・キャッチコピー・紹介文の言い回し改善は許可されます(事実の断定は避ける)。",
    "- 変更が不要・不可能な指示には空の ops を返し、message で理由を日本語で説明します。",
    "",
    "# 各操作の正確な形（この構造・キー名を厳守。独自のキーを作らないこと）",
    '- set_detail: { "op":"set_detail", "field":<下記の英語キー>, "value":"<文字列>" }  ← 事実項目の設定',
    '- clear_detail: { "op":"clear_detail", "field":<下記の英語キー> }  ← 事実項目の掲載取りやめ',
    '- set_hero: { "op":"set_hero", "headline"?:"", "subheadline"?:"", "catchCopy"?:"" }',
    '- set_about: { "op":"set_about", "heading"?:"", "body"?:["段落1","段落2"] }',
    '- set_services: { "op":"set_services", "heading"?:"", "items"?:[{"title":"","description":""}] }',
    '- set_work_content: { "op":"set_work_content", "heading"?:"", "items"?:[{"title":"","description":""}] }',
    '- set_contact: { "op":"set_contact", "heading"?:"", "note"?:"" }',
    '- set_theme: { "op":"set_theme", "preset":"' + THEME_PRESETS.join('"|"') + '" }',
    '- reorder_sections: { "op":"reorder_sections", "order":[<セクション名の配列>] }',
    '- set_section_visibility: { "op":"set_section_visibility", "section":<セクション名>, "visible":true|false }',
    "",
    "# set_detail / clear_detail の field に使える英語キー（左が指示語、右が field 値）",
    "- 法人名→corpName / 住所→address / 電話・TEL→tel / FAX→fax / URL・ホームページ→url / メール→email",
    "- 営業時間・受付時間→businessHours / 定休日・休み→holidays / 送迎・アクセス→accessTransport / 昼食・食事→lunch / 工賃・給料→wage",
    "- これ以外の field 値は使用禁止。該当が無ければ set_detail を使わない。",
    "",
    "# セクション名（reorder_sections / set_section_visibility 用）",
    "- " + SECTIONS.join(", "),
    "",
    "# 出力形式",
    "必ず次の JSON のみを出力してください（前後に文章やコードフェンスを付けない）:",
    '{ "message": "<事業所向けの日本語の説明>", "ops": [ <EditOp>, ... ] }',
    "",
    "# 例",
    "指示「営業時間は平日9時から16時。送迎あり。」→",
    '{ "message":"営業時間と送迎を設定しました。", "ops":[' +
      '{"op":"set_detail","field":"businessHours","value":"平日 9:00〜16:00"},' +
      '{"op":"set_detail","field":"accessTransport","value":"あり"}] }',
  ].join("\n");
}

/** 現在データと指示から user メッセージ本文を組み立てる。 */
export function buildUserMessage(input: ProposeEditInput): string {
  return [
    "# 現在の構造化データ(JSON)",
    "```json",
    JSON.stringify(input.currentData, null, 2),
    "```",
    "",
    "# 事業所からの編集指示",
    input.instruction,
    "",
    "上記を反映する ops と、事業所向けの message を JSON で返してください。",
  ].join("\n");
}

/** モデルの生テキスト出力から JSON を取り出し、EditProposal として検証する。 */
export function parseProposal(raw: string): EditProposal {
  const jsonText = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new EditModelError("モデル出力をJSONとして解釈できません", "bad_output");
  }
  const result = editProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new EditModelError(
      `モデル出力が提案スキーマに適合しません: ${result.error.issues[0]?.message ?? ""}`,
      "bad_output",
    );
  }
  return result.data;
}

/** 前後の説明文やコードフェンスを含む出力から最初の JSON オブジェクトを抽出する。 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new EditModelError("モデル出力にJSONオブジェクトが見つかりません", "bad_output");
  }
  return body.slice(start, end + 1);
}
