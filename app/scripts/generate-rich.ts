// 事業所らしい「リッチな初期HP」を生成するCLI（AI内容＋画像）。
// 単体:  npm run generate-rich -- --facilityNumber 2910103973 [--no-images]
// 一括:  npm run generate-rich -- --count 10 [--prefecture 奈良県] [--no-images]
//        （メール有りの imported/site_generated を対象。営業配信前の量産に使う）
// 画像生成は数十秒/件。一括時は各件の間に待機を入れて過負荷を避ける。

import { prisma } from "@/lib/db.js";
import { generateRichSiteForFacility } from "@/server/generate/generateRichSite.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function runOne(
  f: { id: string; name: string; facilityNumber: string | null },
  withImages: boolean,
  base: string,
) {
  const r = await generateRichSiteForFacility(f.id, { withImages });
  console.log(
    `  ✅ ${f.name}（画像${r.imagesGenerated}枚） → ${base}/preview/${r.slug}`,
  );
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  const count = Number(arg("count") ?? "0");
  const prefecture = arg("prefecture");
  const withImages = !flag("no-images");
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (facilityNumber) {
    const f = await prisma.facility.findUnique({
      where: { facilityNumber },
      select: { id: true, name: true, facilityNumber: true },
    });
    if (!f) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);
    console.log(`「${f.name}」のリッチHPを生成中…（AI内容${withImages ? "＋画像" : ""}）`);
    await runOne(f, withImages, base);
    return;
  }

  if (count > 0) {
    const facilities = await prisma.facility.findMany({
      where: {
        email: { not: null },
        status: { in: ["imported", "site_generated"] },
        ...(prefecture ? { prefecture } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: count,
      select: { id: true, name: true, facilityNumber: true },
    });
    console.log(
      `一括リッチ生成: ${facilities.length}件${prefecture ? `（${prefecture}）` : ""}（AI内容${withImages ? "＋画像" : ""}）`,
    );
    let ok = 0;
    for (const [i, f] of facilities.entries()) {
      try {
        await runOne(f, withImages, base);
        ok += 1;
      } catch (e) {
        console.log(`  ❌ ${f.name}: ${(e as Error).message}`);
      }
      // 過負荷回避（次の件まで少し待つ）
      if (i < facilities.length - 1) await new Promise((r) => setTimeout(r, 2500));
    }
    console.log("─".repeat(50));
    console.log(`完了: ${ok}/${facilities.length}件`);
    return;
  }

  console.error("使い方: --facilityNumber <番号>  もしくは  --count <件数> [--prefecture <県>] [--no-images]");
  process.exit(1);
}

main()
  .catch((e) => {
    console.error("生成失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
