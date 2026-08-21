// 事業所HPの「構造化データ」スキーマ（仕様 STEP6 の核）。
// 共通テンプレート（コード）は不可侵で、事業所ごとの差分はすべてこの JSON に閉じる。
// テンプレ描画・AI編集・ホワイトリスト検証の三者がこの型を唯一の契約として共有する。
//
// 事実性の原則（仕様: 未確認情報は根拠なく生成しない）:
//   - 取込で得た事実（住所/TEL/FAX/URL/メール/名称）は confirmed。
//   - 送迎/営業時間/昼食/工賃/サービス内容など未取得の事実項目は unconfirmed。
//     テンプレは unconfirmed を「準備中（要確認）」表示 or 非表示にし、断定しない。
//   - これら unconfirmed 項目こそ、事業所がAI編集ループで埋めていく対象。

import { z } from "zod";

/** 構造化データのスキーマバージョン（将来のマイグレーション用）。 */
export const SITE_DATA_VERSION = 1 as const;

/** テンプレの節（セクション）。順序・表示/非表示はレイアウト設定で制御。 */
export const SECTIONS = [
  "hero",
  "about",
  "services",
  "workContent",
  "dailyFlow",
  "details",
  "access",
  "gallery",
  "contact",
] as const;
export type Section = (typeof SECTIONS)[number];

/** 就労継続支援B型HPで使うアイコン語彙（実体はテンプレ内のインラインSVG）。 */
export const ICON_KEYS = [
  "box", // 軽作業・梱包
  "scissors", // ものづくり・手芸
  "laptop", // PC作業
  "bus", // 送迎
  "lunch", // 昼食
  "calendar", // 見学・予約
  "people", // 朝礼・面談
  "pencil", // 作業
  "flag", // 終礼・区切り
  "heart", // 支援・安心
  "clock", // 時間
  "leaf", // 自然・成長
  "sun", // あたたかさ
  "star", // 得意・強み
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** 配色プリセット（design reference: 緑＝安心/福祉、橙＝あたたかさ）。 */
export const THEME_PRESETS = ["green", "orange", "greenOrange"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** 事実項目の確認状態。unconfirmed は断定表示しない。 */
export const FIELD_STATES = ["confirmed", "unconfirmed"] as const;
export type FieldState = (typeof FIELD_STATES)[number];

/** 事実として扱う文字列項目。value が空でも state で「準備中」を表現できる。 */
export const factFieldSchema = z.object({
  value: z.string().max(400).nullable(),
  state: z.enum(FIELD_STATES),
});
export type FactField = z.infer<typeof factFieldSchema>;

/** サービス/作業内容の1項目。icon/image は任意（未指定でも従来通り描画）。 */
export const listItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(600).default(""),
  icon: z.enum(ICON_KEYS).optional(),
  image: z.string().max(1000).default(""),
});
export type ListItem = z.infer<typeof listItemSchema>;

/** ヒーロー下のハイライト・バッジ（見学受付中/送迎相談可/昼食あり 等）。 */
export const highlightSchema = z.object({
  icon: z.enum(ICON_KEYS),
  label: z.string().min(1).max(40),
});
export type Highlight = z.infer<typeof highlightSchema>;

/** 「一日の流れ」タイムラインの1ステップ。 */
export const flowStepSchema = z.object({
  time: z.string().max(20).default(""),
  title: z.string().min(1).max(40),
  description: z.string().max(200).default(""),
  icon: z.enum(ICON_KEYS).optional(),
});
export type FlowStep = z.infer<typeof flowStepSchema>;

/** 写真1枚（初期は空。掲載は事業所の許可が前提）。 */
export const photoSchema = z.object({
  url: z.string().max(1000),
  alt: z.string().max(200).default(""),
  caption: z.string().max(200).default(""),
});
export type Photo = z.infer<typeof photoSchema>;

export const siteDataSchema = z.object({
  version: z.literal(SITE_DATA_VERSION),

  // 見出し系（生成テキスト。事実の断定を含めない安全なコピー）
  hero: z.object({
    headline: z.string().min(1).max(120),
    subheadline: z.string().max(200).default(""),
    catchCopy: z.string().max(300).default(""),
    // メインビジュアル（空なら従来のグラデーションのみ）。
    image: z.string().max(1000).default(""),
    imageAlt: z.string().max(200).default(""),
    // CTA直下のバッジ群（未確認は空。AI編集で事業所が付与）。
    highlights: z.array(highlightSchema).max(4).default([]),
  }),
  about: z.object({
    heading: z.string().max(80).default("私たちについて"),
    body: z.array(z.string().max(1000)).max(6).default([]),
  }),

  // サービス・作業内容（未確認なら items 空＋unconfirmed で「準備中」表示）
  services: z.object({
    heading: z.string().max(80).default("サービス内容"),
    state: z.enum(FIELD_STATES),
    items: z.array(listItemSchema).max(20).default([]),
  }),
  workContent: z.object({
    heading: z.string().max(80).default("主な作業内容"),
    state: z.enum(FIELD_STATES),
    items: z.array(listItemSchema).max(20).default([]),
  }),

  // 一日の流れ（未取得は unconfirmed＝「準備中」表示。AI編集で事業所が確定）
  dailyFlow: z
    .object({
      heading: z.string().max(80).default("一日の流れ"),
      state: z.enum(FIELD_STATES).default("unconfirmed"),
      steps: z.array(flowStepSchema).max(8).default([]),
    })
    .default({ heading: "一日の流れ", state: "unconfirmed", steps: [] }),

  // 事実の詳細（confirmed=取込事実 / unconfirmed=要確認）
  details: z.object({
    heading: z.string().max(80).default("事業所情報"),
    corpName: factFieldSchema,
    address: factFieldSchema,
    tel: factFieldSchema,
    fax: factFieldSchema,
    url: factFieldSchema,
    email: factFieldSchema,
    businessHours: factFieldSchema, // 営業時間
    holidays: factFieldSchema, // 休業日
    accessTransport: factFieldSchema, // 送迎
    lunch: factFieldSchema, // 昼食
    wage: factFieldSchema, // 工賃
  }),

  // アクセス（地図）。mapQuery が空なら details.address を用いる。
  // 住所が confirmed のときのみテンプレが地図を描画する＝事実性を自動担保。
  access: z
    .object({
      heading: z.string().max(80).default("アクセス"),
      mapQuery: z.string().max(300).default(""),
      note: z.string().max(400).default(""),
    })
    .default({ heading: "アクセス", mapQuery: "", note: "" }),

  gallery: z.object({
    heading: z.string().max(80).default("事業所の様子"),
    photos: z.array(photoSchema).max(30).default([]),
  }),

  contact: z.object({
    heading: z.string().max(80).default("お問い合わせ"),
    note: z.string().max(600).default(""),
    // 「ご利用をお考えの方へ」CTAカード（空なら非表示）。
    ctaTitle: z.string().max(80).default(""),
    ctaBody: z.string().max(400).default(""),
    ctaLabel: z.string().max(40).default(""),
  }),

  theme: z.object({
    preset: z.enum(THEME_PRESETS),
  }),

  layout: z.object({
    sectionOrder: z.array(z.enum(SECTIONS)),
    hidden: z.array(z.enum(SECTIONS)).default([]),
  }),
});

export type SiteData = z.infer<typeof siteDataSchema>;

/** 未確認の事実項目。 */
export function unconfirmedField(): FactField {
  return { value: null, state: "unconfirmed" };
}

/** 取込済みの事実項目。空文字は未確認とみなす。 */
export function confirmedField(value: string | null | undefined): FactField {
  const v = value?.trim() ?? "";
  return v.length > 0
    ? { value: v, state: "confirmed" }
    : unconfirmedField();
}

/** unconfirmed もしくは value 空なら「掲載しない/準備中」と判断する。 */
export function isPresentable(field: FactField): boolean {
  return field.state === "confirmed" && !!field.value && field.value.length > 0;
}
