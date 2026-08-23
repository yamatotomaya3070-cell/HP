// 事業所らしい「リッチな初期HP」を生成する（要望1）。
// generateCustomContent（AI内容）＋ 画像生成 → 画像はDB保存(/api/media) → リッチ SiteData を
// 新しい SiteVersion として保存し currentVersion に紐付ける。
//
// 事実性: 具体的な数値項目（工賃/営業時間/送迎/昼食等）は AI 生成せず unconfirmed のまま。
//   → 事業所がメール返信で埋める（既存の編集ループ）。生成内容はサンプル扱い（注意書きで明示）。

import { prisma } from "@/lib/db.js";
import {
  type SiteData,
  siteDataSchema,
  confirmedField,
  unconfirmedField,
} from "@/lib/siteData.js";
import { generateSiteForFacility } from "./generateSite.js";
import { generateCustomContent } from "./customizeContent.js";
import { getImageGenerator } from "@/server/media/imageGenerator.js";
import { saveGeneratedImage } from "@/server/media/imageStore.js";

export interface RichGenerateResult {
  siteId: string;
  slug: string;
  versionId: string;
  imagesGenerated: number;
}

/** 画像を1枚生成して保存し配信URLを返す（失敗時は空文字で継続）。 */
async function genImage(
  gen: ReturnType<typeof getImageGenerator>,
  prompt: string,
  ar: "16:9" | "4:3",
  facilityId: string,
  maxWidth: number,
): Promise<string> {
  try {
    const { bytes } = await gen.generateFromPrompt(prompt, ar);
    const stored = await saveGeneratedImage(bytes, { facilityId, maxWidth });
    return stored.url;
  } catch (e) {
    console.log(`画像生成スキップ: ${(e as Error).message}`);
    return "";
  }
}

/** 事業所IDから「その企業らしい」リッチHPを生成し、新バージョンを現行にする。 */
export async function generateRichSiteForFacility(
  facilityId: string,
  opts: { withImages?: boolean } = {},
): Promise<RichGenerateResult> {
  const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
  if (!facility) throw new Error(`事業所が見つかりません: ${facilityId}`);

  // 1. サイト（slug）を確保（無ければ初期生成で作る）
  const base = await generateSiteForFacility(facilityId);

  // 2. その企業らしい内容をAI生成
  const content = await generateCustomContent({
    name: facility.name,
    corpName: facility.corpName,
    address: facility.address,
    prefecture: facility.prefecture,
  });

  // 3. テーマに合った画像を生成しDB保存
  const withImages = opts.withImages ?? true;
  let heroUrl = "";
  const serviceUrls: string[] = [];
  let imagesGenerated = 0;
  const services = content.services.slice(0, 3);
  if (withImages) {
    const gen = getImageGenerator();
    heroUrl = await genImage(gen, content.heroImagePrompt, "16:9", facilityId, 1280);
    if (heroUrl) imagesGenerated += 1;
    for (const s of services) {
      const url = await genImage(gen, s.imagePrompt, "4:3", facilityId, 800);
      serviceUrls.push(url);
      if (url) imagesGenerated += 1;
    }
  }

  // 4. リッチ SiteData を組み立て
  const subheadline = facility.prefecture
    ? `${facility.prefecture}の就労継続支援B型事業所`
    : "就労継続支援B型事業所";

  const data: SiteData = {
    version: 1,
    hero: {
      headline: facility.name,
      subheadline,
      catchCopy: content.catchCopy,
      image: heroUrl,
      imageAlt: heroUrl ? `${facility.name}の作業風景（イメージ）` : "",
      highlights: content.highlights.slice(0, 4),
    },
    about: { heading: "私たちについて", body: content.aboutBody.slice(0, 4) },
    services: {
      heading: `${facility.name}でできること`,
      state: services.length > 0 ? "confirmed" : "unconfirmed",
      items: services.map((s, i) => ({
        title: s.title,
        description: s.description,
        icon: s.icon,
        image: serviceUrls[i] ?? "",
      })),
    },
    workContent: { heading: "主な作業内容", state: "unconfirmed", items: [] },
    dailyFlow: {
      heading: "一日の流れ",
      state: content.dailyFlow.length > 0 ? "confirmed" : "unconfirmed",
      steps: content.dailyFlow.slice(0, 8),
    },
    details: {
      heading: "事業所情報",
      corpName: confirmedField(facility.corpName),
      address: confirmedField(facility.address),
      tel: confirmedField(facility.tel),
      fax: confirmedField(facility.fax),
      url: confirmedField(facility.url),
      email: confirmedField(facility.email),
      // 具体的な事実は生成しない（事業所が返信で埋める）
      businessHours: unconfirmedField(),
      holidays: unconfirmedField(),
      accessTransport: unconfirmedField(),
      lunch: unconfirmedField(),
      wage: unconfirmedField(),
    },
    access: { heading: "アクセス", mapQuery: "", note: "" },
    gallery: { heading: "事業所の様子", photos: [] },
    contact: {
      heading: "お問い合わせ",
      note: "見学・体験・ご質問など、お気軽にお問い合わせください。",
      ctaTitle: "ご利用をお考えの方へ",
      ctaBody: "見学は随時受け付けています。まずは事業所の雰囲気をご覧ください。",
      ctaLabel: "まずはお気軽にご相談ください",
    },
    theme: { preset: "greenOrange" },
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
      hidden: ["workContent"],
    },
  };
  const validated = siteDataSchema.parse(data);

  // 5. 新バージョンを作成し現行に紐付け
  const version = await prisma.$transaction(async (tx) => {
    const v = await tx.siteVersion.create({
      data: {
        siteId: base.siteId,
        facilityId,
        data: validated,
        origin: "import",
        note: "AIによる事業所別リッチ生成（サンプル）",
      },
      select: { id: true },
    });
    await tx.generatedSite.update({
      where: { id: base.siteId },
      data: { currentVersionId: v.id },
    });
    await tx.leadEvent.create({
      data: {
        facilityId,
        type: "site_generated",
        meta: { siteId: base.siteId, kind: "rich", imagesGenerated },
      },
    });
    await tx.auditLog.create({
      data: {
        facilityId,
        action: "site.generate_rich",
        actor: "system",
        after: { siteId: base.siteId, versionId: v.id, imagesGenerated },
      },
    });
    return v;
  });

  return {
    siteId: base.siteId,
    slug: base.slug,
    versionId: version.id,
    imagesGenerated,
  };
}
