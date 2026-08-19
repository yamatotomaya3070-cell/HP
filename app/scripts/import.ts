// 取込CLI。使用例:
//   npm run import -- "../WAM_NET_就労継続支援B型_収集/results"
//   npm run import -- "../WAM_NET_就労継続支援B型_収集/results/奈良県/奈良県_emails.json"
import { importFromPath } from "@/server/import/importFacilities.js";
import { prisma } from "@/lib/db.js";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("使い方: npm run import -- <ファイル or ディレクトリのパス>");
    process.exit(1);
  }

  console.log(`取込開始: ${path}`);
  const { summaries, skipped } = await importFromPath(path, {
    onProgress: (s) => {
      console.log(
        `  [${s.source}] 行:${s.totalRows} 新規:${s.inserted} 更新:${s.updated} ` +
          `ファイル内重複:${s.duplicatesInFile} エラー:${s.errors.length}`,
      );
    },
  });

  if (skipped.length > 0) {
    console.log(`読み飛ばし ${skipped.length}件:`);
    for (const sk of skipped) console.log(`  - ${sk.path}: ${sk.reason}`);
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      rows: acc.rows + s.totalRows,
      inserted: acc.inserted + s.inserted,
      updated: acc.updated + s.updated,
      dups: acc.dups + s.duplicatesInFile,
      errors: acc.errors + s.errors.length,
    }),
    { rows: 0, inserted: 0, updated: 0, dups: 0, errors: 0 },
  );

  console.log("─".repeat(50));
  console.log(
    `完了: ファイル${summaries.length}件 / 行${totals.rows} / ` +
      `新規${totals.inserted} / 更新${totals.updated} / 重複${totals.dups} / エラー${totals.errors}`,
  );
}

main()
  .catch((e) => {
    console.error("取込失敗:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
