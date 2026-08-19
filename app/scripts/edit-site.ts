// AI編集CLI。2通り:
//   自然文(要APIキー):
//     npm run edit -- --facilityNumber 2910103973 --instruction "営業時間は平日9時から16時です"
//   オフライン(ops直指定・キー不要。パイプライン検証/デモ用):
//     npm run edit -- --facilityNumber 2910103973 --ops '[{"op":"set_detail","field":"businessHours","value":"平日 9:00〜16:00"}]'
import { prisma } from "@/lib/db.js";
import { runEdit } from "@/server/edit/runEdit.js";
import { createEditModel } from "@/server/edit/editModelFactory.js";
import { type EditModel } from "@/server/edit/editModel.js";
import { editProposalSchema } from "@/lib/editOps.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** ops を直接返すオフラインモデル（デモ・テスト用）。 */
function fixedModel(opsJson: string): EditModel {
  const ops = JSON.parse(opsJson);
  const proposal = editProposalSchema.parse({
    message: "指定された操作を適用しました。",
    ops,
  });
  return { proposeEdits: async () => proposal };
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  const instruction = arg("instruction");
  const opsJson = arg("ops");
  if (!facilityNumber) throw new Error("--facilityNumber が必要です");

  const facility = await prisma.facility.findUnique({
    where: { facilityNumber },
    select: { id: true, name: true },
  });
  if (!facility) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);

  const model: EditModel = opsJson
    ? fixedModel(opsJson)
    : createEditModel();
  const text = instruction ?? "(ops直指定)";

  const result = await runEdit(
    { facilityId: facility.id, instruction: text, channel: "editor", actor: "cli" },
    model,
  );

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  console.log(`事業所: ${facility.name}`);
  console.log(`AIの返答: ${result.message}`);
  console.log(`適用: ${result.appliedCount}件 / 不採用: ${result.rejected.length}件`);
  if (result.rejected.length) {
    for (const r of result.rejected) console.log(`  - [${r.index}] ${r.reason}`);
  }
  console.log(`プレビュー: ${base}/preview/${result.slug}`);
}

main()
  .catch((e) => {
    console.error("編集失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
