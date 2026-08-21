// 取込済み事業所の「事実」から初期 SiteData を組み立てる。
// 事実は confirmed、未取得（送迎/営業時間/昼食/工賃/サービス内容）は unconfirmed。
// 見出しコピーは事実を断定しない安全な定型文のみ。ここから事業所がAI編集で肉付けする。

import {
  SITE_DATA_VERSION,
  type SiteData,
  type ThemePreset,
  confirmedField,
  unconfirmedField,
} from "@/lib/siteData.js";

/** buildInitialSiteData が必要とする事業所の最小事実。 */
export interface FacilityFacts {
  name: string;
  corpName?: string | null;
  address?: string | null;
  prefecture?: string | null;
  tel?: string | null;
  fax?: string | null;
  url?: string | null;
  email?: string | null;
}

/** 事実を断定しない、就労継続支援B型向けの安全な定型導入文。 */
function safeAboutBody(name: string): string[] {
  return [
    `${name}は、就労継続支援B型事業所です。`,
    "一人ひとりのペースを大切にしながら、働くことを通じた日々の充実を支援しています。",
    "見学・体験のお問い合わせを歓迎しています。詳しい内容はお気軽にお尋ねください。",
  ];
}

export interface BuildInitialOptions {
  theme?: ThemePreset;
}

/** 事業所factsから初期 SiteData を生成する。 */
export function buildInitialSiteData(
  facility: FacilityFacts,
  options: BuildInitialOptions = {},
): SiteData {
  const name = facility.name.trim();

  return {
    version: SITE_DATA_VERSION,

    hero: {
      headline: name,
      subheadline: facility.prefecture
        ? `${facility.prefecture}の就労継続支援B型事業所`
        : "就労継続支援B型事業所",
      catchCopy: "あなたらしく、働く。",
      // メインビジュアル・バッジは未確認。事業所がAI編集で付与する。
      image: "",
      imageAlt: "",
      highlights: [],
    },

    about: {
      heading: "私たちについて",
      body: safeAboutBody(name),
    },

    // サービス・作業内容は未取得のため unconfirmed（テンプレは「準備中」表示）
    services: {
      heading: "サービス内容",
      state: "unconfirmed",
      items: [],
    },
    workContent: {
      heading: "主な作業内容",
      state: "unconfirmed",
      items: [],
    },

    // 一日の流れは事業所ごとに異なる事実のため未確認（AI編集で確定）。
    dailyFlow: {
      heading: "一日の流れ",
      state: "unconfirmed",
      steps: [],
    },

    details: {
      heading: "事業所情報",
      corpName: confirmedField(facility.corpName),
      address: confirmedField(facility.address),
      tel: confirmedField(facility.tel),
      fax: confirmedField(facility.fax),
      url: confirmedField(facility.url),
      email: confirmedField(facility.email),
      // 以下は根拠がないため未確認（AI編集で事業所が入力する）
      businessHours: unconfirmedField(),
      holidays: unconfirmedField(),
      accessTransport: unconfirmedField(),
      lunch: unconfirmedField(),
      wage: unconfirmedField(),
    },

    // 住所が confirmed なら details.address から自動で地図を描画（mapQuery 空でOK）。
    access: {
      heading: "アクセス",
      mapQuery: "",
      note: "",
    },

    gallery: {
      heading: "事業所の様子",
      photos: [], // 掲載は事業所の許可が前提
    },

    contact: {
      heading: "お問い合わせ",
      note: "見学・体験・ご質問など、お気軽にお問い合わせください。",
      ctaTitle: "",
      ctaBody: "",
      ctaLabel: "",
    },

    theme: {
      preset: options.theme ?? "greenOrange",
    },

    layout: {
      sectionOrder: [
        "hero",
        "about",
        "services",
        "workContent",
        "dailyFlow",
        "details",
        "access",
        "gallery",
        "contact",
      ],
      hidden: [],
    },
  };
}
