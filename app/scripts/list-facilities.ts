// 事業所集計CLI。都道府県別・ステータス別の件数を表示。
//   npm run facilities:list
import { countByPrefecture, countByStatus } from "@/server/facilities/listFacilities.js";
import { prisma } from "@/lib/db.js";

async function main() {
  const byPref = await countByPrefecture();
  const total = byPref.reduce((s, r) => s + r.total, 0);
  const totalEmail = byPref.reduce((s, r) => s + r.withEmail, 0);

  console.log("=== 都道府県別 ===");
  for (const r of byPref) {
    console.log(`  ${r.prefecture ?? "(不明)"}: ${r.total}件 (メール ${r.withEmail})`);
  }
  console.log("─".repeat(40));
  console.log(`  合計: ${total}件 (メール ${totalEmail})`);

  console.log("\n=== ステータス別 ===");
  for (const r of await countByStatus()) {
    console.log(`  ${r.status}: ${r.count}件`);
  }
}

main()
  .catch((e) => {
    console.error("集計失敗:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
