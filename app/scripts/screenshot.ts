// プレビューHPのスクリーンショット生成CLI。
//   任意URL（DB不要・自己完結。動作確認に便利）:
//     npm run screenshot -- --url http://localhost:3000/preview/abc --out screenshots/abc.png
//   事業所指定（DB必要。slug解決→保存→GeneratedSite.screenshotPath更新）:
//     npm run screenshot -- --facilityNumber 2910103973
// ※ 事業所モードは preview URL が到達可能である必要がある（dev サーバ起動＋DB）。

import { captureUrlToFile } from "@/server/screenshot/captureSite.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function captureByUrl(url: string, out: string) {
  const saved = await captureUrlToFile({ url, outPath: out });
  console.log(`保存: ${saved}`);
}

async function captureByFacility(facilityNumber: string) {
  const { prisma } = await import("@/lib/db.js");
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  try {
    const facility = await prisma.facility.findUnique({
      where: { facilityNumber },
      include: { sites: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!facility) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);
    const site = facility.sites[0];
    if (!site) throw new Error("この事業所のHPが未生成です（先に npm run generate）");

    const out = `screenshots/${site.slug}.png`;
    const saved = await captureUrlToFile({ url: `${base}/preview/${site.slug}`, outPath: out });
    await prisma.generatedSite.update({ where: { id: site.id }, data: { screenshotPath: saved } });
    console.log(`保存: ${saved}\nGeneratedSite.screenshotPath を更新しました`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const url = arg("url");
  const out = arg("out");
  const facilityNumber = arg("facilityNumber");

  if (url) {
    await captureByUrl(url, out ?? "screenshots/capture.png");
  } else if (facilityNumber) {
    await captureByFacility(facilityNumber);
  } else {
    console.error("使い方: --url <URL> [--out <path>]  もしくは  --facilityNumber <番号>");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("撮影失敗:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
