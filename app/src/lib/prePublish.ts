// 公開前確認の「純粋な」定義（Zod・ラベル・レビュー整形）。DB非依存でクライアントからも読める。
// DBを伴う記録は src/server/publish/prePublish.ts に置く。

import { z } from "zod";
import { type SiteData, isPresentable } from "./siteData.js";

/** 確認チェック項目（UI 表示ラベルと検証キーの単一のソース）。 */
export const PRE_PUBLISH_ITEMS = [
  {
    key: "contentAccurate",
    label:
      "事業所名・法人名・所在地・電話番号・URL・掲載内容に誤りがないことを確認しました",
  },
  {
    key: "photoConsent",
    label:
      "掲載する写真は、当事業所が掲載を許可したものです（写真が無い場合も確認済みとします）",
  },
  {
    key: "contactCorrect",
    label: "お問い合わせ先（電話・フォーム）が正しいことを確認しました",
  },
  { key: "termsAgreed", label: "利用規約に同意します" },
  { key: "privacyAgreed", label: "プライバシーポリシーに同意します" },
] as const;

export type PrePublishKey = (typeof PRE_PUBLISH_ITEMS)[number]["key"];

/** すべての項目が true（確認済み）であることを要求する。 */
export const prePublishConfirmSchema = z.object({
  contentAccurate: z.literal(true),
  photoConsent: z.literal(true),
  contactCorrect: z.literal(true),
  termsAgreed: z.literal(true),
  privacyAgreed: z.literal(true),
});
export type PrePublishConfirm = z.infer<typeof prePublishConfirmSchema>;

export interface ReviewRow {
  label: string;
  value: string;
  /** 未確認・未入力（掲載されない項目）は要注意として表示する。 */
  missing: boolean;
}

/** 公開前に事業所へ提示する「実際に載る内容」の一覧を組み立てる。 */
export function buildPublishReview(data: SiteData, facilityName: string): ReviewRow[] {
  const d = data.details;
  const factRow = (label: string, f: SiteData["details"]["corpName"]): ReviewRow => {
    const present = isPresentable(f);
    return {
      label,
      value: present ? (f.value as string) : "（未掲載・準備中）",
      missing: !present,
    };
  };
  const serviceCount = data.services.items.length;
  const photoCount = data.gallery.photos.length;

  return [
    { label: "事業所名", value: facilityName, missing: false },
    factRow("法人名", d.corpName),
    factRow("所在地", d.address),
    factRow("電話番号", d.tel),
    factRow("ホームページURL", d.url),
    factRow("営業時間", d.businessHours),
    factRow("送迎", d.accessTransport),
    factRow("昼食", d.lunch),
    factRow("工賃", d.wage),
    {
      label: "サービス内容",
      value: serviceCount > 0 ? `${serviceCount}件を掲載` : "（未掲載・準備中）",
      missing: serviceCount === 0,
    },
    {
      label: "掲載写真",
      value: photoCount > 0 ? `${photoCount}枚` : "なし",
      missing: false,
    },
  ];
}
