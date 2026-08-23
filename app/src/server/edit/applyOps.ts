// 操作(EditOp)を SiteData へ不変的に適用する純関数。副作用なし・DB非依存。
// 適用後に SiteData 全体を再検証（多層防御）。ホワイトリスト外の変更は原理的に起きない。

import {
  type SiteData,
  type Section,
  siteDataSchema,
} from "@/lib/siteData.js";
import {
  type EditOp,
  type DetailField,
  editOpSchema,
} from "@/lib/editOps.js";

export interface ApplyResult {
  data: SiteData;
  appliedCount: number;
  /** 検証に通らず適用されなかった操作（理由付き）。握りつぶさず返す。 */
  rejected: { index: number; reason: string }[];
}

/** 詳細フィールドを confirmed 値で更新した details を返す（不変）。 */
function withDetail(
  data: SiteData,
  field: DetailField,
  value: string | null,
): SiteData["details"] {
  return {
    ...data.details,
    [field]:
      value === null
        ? { value: null, state: "unconfirmed" as const }
        : { value, state: "confirmed" as const },
  };
}

/** 単一操作を適用（呼び出し側で検証済み前提）。 */
function applyOne(data: SiteData, op: EditOp): SiteData {
  switch (op.op) {
    case "set_hero":
      return {
        ...data,
        hero: {
          ...data.hero,
          headline: op.headline ?? data.hero.headline,
          subheadline: op.subheadline ?? data.hero.subheadline,
          catchCopy: op.catchCopy ?? data.hero.catchCopy,
        },
      };
    case "set_hero_media":
      return {
        ...data,
        hero: {
          ...data.hero,
          image: op.image,
          imageAlt: op.imageAlt ?? data.hero.imageAlt,
        },
      };
    case "set_highlights":
      return {
        ...data,
        hero: { ...data.hero, highlights: op.highlights },
      };
    case "set_about":
      return {
        ...data,
        about: {
          heading: op.heading ?? data.about.heading,
          body: op.body ?? data.about.body,
        },
      };
    case "set_services":
      return {
        ...data,
        services: {
          heading: op.heading ?? data.services.heading,
          items: op.items ?? data.services.items,
          // items を与えたら confirmed。空配列で明示的に「無し」も表現可。
          state: op.items !== undefined ? "confirmed" : data.services.state,
        },
      };
    case "set_work_content":
      return {
        ...data,
        workContent: {
          heading: op.heading ?? data.workContent.heading,
          items: op.items ?? data.workContent.items,
          state: op.items !== undefined ? "confirmed" : data.workContent.state,
        },
      };
    case "set_daily_flow":
      return {
        ...data,
        dailyFlow: {
          heading: op.heading ?? data.dailyFlow.heading,
          steps: op.steps,
          // steps を与えたら confirmed（空配列で明示的に「無し」も表現可）。
          state: "confirmed",
        },
      };
    case "set_detail":
      return { ...data, details: withDetail(data, op.field, op.value) };
    case "clear_detail":
      return { ...data, details: withDetail(data, op.field, null) };
    case "set_access":
      return {
        ...data,
        access: {
          heading: op.heading ?? data.access.heading,
          mapQuery: op.mapQuery ?? data.access.mapQuery,
          note: op.note ?? data.access.note,
          geo: data.access.geo,
        },
      };
    case "add_photo":
      return {
        ...data,
        gallery: {
          ...data.gallery,
          photos: [...data.gallery.photos, op.photo],
        },
      };
    case "set_gallery":
      return {
        ...data,
        gallery: {
          heading: op.heading ?? data.gallery.heading,
          photos: op.photos,
        },
      };
    case "set_contact":
      return {
        ...data,
        contact: {
          ...data.contact,
          heading: op.heading ?? data.contact.heading,
          note: op.note ?? data.contact.note,
          ctaTitle: op.ctaTitle ?? data.contact.ctaTitle,
          ctaBody: op.ctaBody ?? data.contact.ctaBody,
          ctaLabel: op.ctaLabel ?? data.contact.ctaLabel,
        },
      };
    case "set_theme":
      return { ...data, theme: { preset: op.preset } };
    case "reorder_sections": {
      // 与えられた順序に、欠けているセクションを元の順で末尾補完（全セクション網羅を保証）。
      const seen = new Set<Section>(op.order);
      const rest = data.layout.sectionOrder.filter((s) => !seen.has(s));
      return {
        ...data,
        layout: { ...data.layout, sectionOrder: [...op.order, ...rest] },
      };
    }
    case "set_section_visibility": {
      const hidden = new Set<Section>(data.layout.hidden);
      if (op.visible) hidden.delete(op.section);
      else hidden.add(op.section);
      return {
        ...data,
        layout: { ...data.layout, hidden: [...hidden] },
      };
    }
    default: {
      // 網羅性を型で保証（新 op 追加時に漏れをコンパイルエラー化）。
      const _exhaustive: never = op;
      return data;
    }
  }
}

/**
 * 操作リストを適用する。各操作を個別に Zod 検証し、通ったものだけ適用。
 * 最後に SiteData 全体を再検証し、不整合ならその操作を巻き戻す（多層防御）。
 */
export function applyOps(base: SiteData, ops: unknown[]): ApplyResult {
  let data = base;
  let appliedCount = 0;
  const rejected: { index: number; reason: string }[] = [];

  ops.forEach((raw, index) => {
    const parsed = editOpSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ index, reason: parsed.error.issues[0]?.message ?? "不正な操作" });
      return;
    }
    const next = applyOne(data, parsed.data);
    // 適用結果が契約(スキーマ)を満たすかを都度検証。破れば不採用。
    const check = siteDataSchema.safeParse(next);
    if (!check.success) {
      rejected.push({
        index,
        reason: check.error.issues[0]?.message ?? "適用後の検証に失敗",
      });
      return;
    }
    data = check.data;
    appliedCount += 1;
  });

  return { data, appliedCount, rejected };
}
