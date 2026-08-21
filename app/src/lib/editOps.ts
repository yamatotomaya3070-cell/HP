// AI編集のホワイトリスト（仕様 STEP6・9）。
// AIは自由なJSONパッチではなく、この「操作語彙」だけを出力できる。
// これにより:
//   - 変更できるのは構造化データの許可フィールドのみ（テンプレのコードは対象外）
//   - slug / publishState / 他事業所 / スキーマ外キー は原理的に触れない
//   - 各操作は Zod で検証され、適用後に SiteData 全体を再検証する
// 事実項目(details)の設定は confirmed 化を伴う＝事業所本人が申告した事実として扱う。

import { z } from "zod";
import {
  SECTIONS,
  THEME_PRESETS,
  listItemSchema,
  highlightSchema,
  flowStepSchema,
  photoSchema,
} from "./siteData.js";

/** confirmed 化できる事実フィールド（詳細セクション）。 */
export const DETAIL_FIELDS = [
  "corpName",
  "address",
  "tel",
  "fax",
  "url",
  "email",
  "businessHours",
  "holidays",
  "accessTransport",
  "lunch",
  "wage",
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];

export const editOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set_hero"),
    headline: z.string().min(1).max(120).optional(),
    subheadline: z.string().max(200).optional(),
    catchCopy: z.string().max(300).optional(),
  }),
  z.object({
    op: z.literal("set_about"),
    heading: z.string().max(80).optional(),
    body: z.array(z.string().max(1000)).max(6).optional(),
  }),
  z.object({
    op: z.literal("set_services"),
    heading: z.string().max(80).optional(),
    items: z.array(listItemSchema).max(20).optional(),
  }),
  z.object({
    op: z.literal("set_work_content"),
    heading: z.string().max(80).optional(),
    items: z.array(listItemSchema).max(20).optional(),
  }),
  // 事実項目を申告値で confirmed 化する。
  z.object({
    op: z.literal("set_detail"),
    field: z.enum(DETAIL_FIELDS),
    value: z.string().min(1).max(400),
  }),
  // 事実項目を未確認へ戻す（掲載取りやめ）。
  z.object({
    op: z.literal("clear_detail"),
    field: z.enum(DETAIL_FIELDS),
  }),
  z.object({
    op: z.literal("set_contact"),
    heading: z.string().max(80).optional(),
    note: z.string().max(600).optional(),
    ctaTitle: z.string().max(80).optional(),
    ctaBody: z.string().max(400).optional(),
    ctaLabel: z.string().max(40).optional(),
  }),
  // ヒーローのメインビジュアル（画像URL）。空文字で画像を外す。
  z.object({
    op: z.literal("set_hero_media"),
    image: z.string().max(1000),
    imageAlt: z.string().max(200).optional(),
  }),
  // ヒーロー下のバッジ（見学受付中/送迎相談可/昼食あり 等）。
  z.object({
    op: z.literal("set_highlights"),
    highlights: z.array(highlightSchema).max(4),
  }),
  // 一日の流れ。steps を与えると confirmed 化。
  z.object({
    op: z.literal("set_daily_flow"),
    heading: z.string().max(80).optional(),
    steps: z.array(flowStepSchema).max(8),
  }),
  // アクセス（地図の表示位置・補足）。mapQuery 空なら住所を使用。
  z.object({
    op: z.literal("set_access"),
    heading: z.string().max(80).optional(),
    mapQuery: z.string().max(300).optional(),
    note: z.string().max(400).optional(),
  }),
  // ギャラリー写真を追加する（掲載は事業所の許可が前提）。
  z.object({
    op: z.literal("add_photo"),
    photo: photoSchema,
  }),
  // ギャラリー写真を全置換／並べ替え。
  z.object({
    op: z.literal("set_gallery"),
    heading: z.string().max(80).optional(),
    photos: z.array(photoSchema).max(30),
  }),
  z.object({
    op: z.literal("set_theme"),
    preset: z.enum(THEME_PRESETS),
  }),
  z.object({
    op: z.literal("reorder_sections"),
    order: z.array(z.enum(SECTIONS)),
  }),
  z.object({
    op: z.literal("set_section_visibility"),
    section: z.enum(SECTIONS),
    visible: z.boolean(),
  }),
]);

export type EditOp = z.infer<typeof editOpSchema>;

/** モデル出力全体（操作リスト＋事業所向けの説明文）。 */
export const editProposalSchema = z.object({
  message: z.string().max(2000),
  ops: z.array(editOpSchema).max(30),
});
export type EditProposal = z.infer<typeof editProposalSchema>;

/** 操作の種類一覧（プロンプト提示用）。 */
export const OP_NAMES = [
  "set_hero",
  "set_hero_media",
  "set_highlights",
  "set_about",
  "set_services",
  "set_work_content",
  "set_daily_flow",
  "set_detail",
  "clear_detail",
  "set_access",
  "add_photo",
  "set_gallery",
  "set_contact",
  "set_theme",
  "reorder_sections",
  "set_section_visibility",
] as const;
