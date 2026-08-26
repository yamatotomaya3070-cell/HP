// 事業所向け「カード登録（14日体験→公開）」リンクを発行する。
//   npm run billing-link -- --facilityNumber 2910103973 [--days 14]
// 発行したURL(/billing/<token>) を開くと、プラン説明→カード登録(Stripe)へ進める。
// Stripeキー未投入時はStubのダミー決済URLに遷移（導線の動作確認用）。

import { prisma } from "@/lib/db.js";
import { issueToken } from "@/lib/tokens.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  const days = Number(arg("days") ?? "14");
  if (!facilityNumber) throw new Error("--facilityNumber が必要です");

  const facility = await prisma.facility.findUnique({
    where: { facilityNumber },
    select: { id: true, name: true },
  });
  if (!facility) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);

  const token = issueToken(facility.id, "billing", days * 24 * 60 * 60);
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  console.log(`事業所: ${facility.name}`);
  console.log(`カード登録リンク(${days}日間有効):`);
  console.log(`${base}/billing/${token}`);
}

main()
  .catch((e) => {
    console.error("発行失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
