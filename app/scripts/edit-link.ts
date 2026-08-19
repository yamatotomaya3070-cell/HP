// 事業所向けマジックリンク（編集画面）を発行する。
//   npm run edit-link -- --facilityNumber 2910103973 [--days 7]
import { prisma } from "@/lib/db.js";
import { issueToken } from "@/lib/tokens.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  const days = Number(arg("days") ?? "7");
  if (!facilityNumber) throw new Error("--facilityNumber が必要です");

  const facility = await prisma.facility.findUnique({
    where: { facilityNumber },
    select: { id: true, name: true },
  });
  if (!facility) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);

  const token = issueToken(facility.id, "edit", days * 24 * 60 * 60);
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  console.log(`事業所: ${facility.name}`);
  console.log(`編集リンク(${days}日間有効):`);
  console.log(`${base}/edit/${token}`);
}

main()
  .catch((e) => {
    console.error("発行失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
