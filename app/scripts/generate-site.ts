// サイト生成CLI。使用例:
//   npm run generate -- --facilityNumber 2910103973
//   npm run generate -- --count 5           （imported 状態の先頭5件）
import { prisma } from "@/lib/db.js";
import { generateSiteForFacility } from "@/server/generate/generateSite.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  const count = Number(arg("count") ?? "0");
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  let facilities: { id: string; name: string }[];
  if (facilityNumber) {
    const f = await prisma.facility.findUnique({
      where: { facilityNumber },
      select: { id: true, name: true },
    });
    if (!f) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);
    facilities = [f];
  } else if (count > 0) {
    facilities = await prisma.facility.findMany({
      where: { status: "imported" },
      take: count,
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  } else {
    console.error("使い方: --facilityNumber <番号>  もしくは  --count <件数>");
    process.exit(1);
  }

  for (const f of facilities) {
    const r = await generateSiteForFacility(f.id);
    console.log(
      `${r.created ? "生成" : "既存"}: ${f.name}\n  プレビュー: ${base}/preview/${r.slug}`,
    );
  }
  console.log(`─`.repeat(50));
  console.log(`対象 ${facilities.length}件`);
}

main()
  .catch((e) => {
    console.error("生成失敗:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
