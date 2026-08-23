// 事業所らしい「リッチな初期HP」を生成するCLI（AI内容＋画像）。
//   npm run generate-rich -- --facilityNumber 2910103973
//   npm run generate-rich -- --facilityNumber 2910103973 --no-images   （画像なしで内容だけ）
// 画像生成は数十秒かかる。生成物は新 SiteVersion として現行に反映される。

import { prisma } from "@/lib/db.js";
import { generateRichSiteForFacility } from "@/server/generate/generateRichSite.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  if (!facilityNumber) {
    console.error("使い方: --facilityNumber <番号> [--no-images]");
    process.exit(1);
  }
  const f = await prisma.facility.findUnique({ where: { facilityNumber } });
  if (!f) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  console.log(`「${f.name}」のリッチHPを生成中…（AI内容${flag("no-images") ? "" : "＋画像"}）`);
  const r = await generateRichSiteForFacility(f.id, { withImages: !flag("no-images") });
  console.log("─".repeat(50));
  console.log(`✅ 生成完了: 画像${r.imagesGenerated}枚`);
  console.log(`  プレビュー: ${base}/preview/${r.slug}`);
  console.log(`  versionId: ${r.versionId}`);
}

main()
  .catch((e) => {
    console.error("生成失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
