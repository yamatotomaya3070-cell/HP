// 課金・公開の状態機械を、自己完結のテスト事業所で通しで検証する（オフライン）。
// 検証する仕様: トライアル→5000円公開ゲート→編集可→重複イベント冪等→解約static→編集不可→再契約再開→編集可。
//   npm run billing-sim
import { prisma } from "@/lib/db.js";
import { generateSiteForFacility } from "@/server/generate/generateSite.js";
import { processPaymentEvent, isAiEditable } from "@/server/billing/lifecycle.js";
import { runEdit } from "@/server/edit/runEdit.js";
import { editProposalSchema } from "@/lib/editOps.js";
import { type EditModel } from "@/server/edit/editModel.js";

function fixedModel(field: string, value: string): EditModel {
  const proposal = editProposalSchema.parse({
    message: "更新しました。",
    ops: [{ op: "set_detail", field, value }],
  });
  return { proposeEdits: async () => proposal };
}

async function state(facilityId: string) {
  const site = await prisma.generatedSite.findFirst({ where: { facilityId } });
  const fac = await prisma.facility.findUnique({ where: { id: facilityId } });
  const editable = await isAiEditable(facilityId);
  return `status=${fac?.status} publish=${site?.publishState} 編集可=${editable}`;
}

async function tryEdit(facilityId: string, field: string, value: string) {
  const r = await runEdit(
    { facilityId, instruction: "(sim)", channel: "editor" },
    fixedModel(field, value),
  );
  return r.applied ? `適用${r.appliedCount}件` : `不可: ${r.message.slice(0, 30)}…`;
}

async function main() {
  // テスト事業所を作成（末尾で削除）
  const num = `SIM-${Date.now()}`;
  const facility = await prisma.facility.create({
    data: { facilityNumber: num, name: "課金シミュレーション事業所", dedupKey: num, status: "imported" },
  });
  const fid = facility.id;
  try {
    await generateSiteForFacility(fid);
    console.log("① 生成直後       :", await state(fid));

    await processPaymentEvent({ type: "trial_started", eventId: "e-trial", facilityId: fid, subscriptionId: "sub_x" });
    console.log("② トライアル開始 :", await state(fid));
    console.log("   トライアル中の編集:", await tryEdit(fid, "businessHours", "9:00〜17:00"));

    const pub = await processPaymentEvent({ type: "payment_succeeded", eventId: "e-pub-1", facilityId: fid, kind: "publish_5000", amount: 5000 });
    console.log("③ 5000円決済     :", pub.note, "/", await state(fid));

    const dup = await processPaymentEvent({ type: "payment_succeeded", eventId: "e-pub-1", facilityId: fid, kind: "publish_5000", amount: 5000 });
    const payCount = await prisma.payment.count({ where: { facilityId: fid, kind: "publish_5000" } });
    console.log("④ 同一イベント再送:", dup.duplicate ? "冪等スキップ" : "!!二重!!", `/ publish決済レコード=${payCount}件`);

    console.log("   公開後の編集     :", await tryEdit(fid, "wage", "月平均15,000円"));

    await processPaymentEvent({ type: "subscription_canceled", eventId: "e-cancel", facilityId: fid });
    console.log("⑤ 解約           :", await state(fid), "←公開は継続・編集停止のはず");
    console.log("   解約後の編集     :", await tryEdit(fid, "lunch", "あり"));

    await processPaymentEvent({ type: "subscription_resumed", eventId: "e-resume", facilityId: fid, subscriptionId: "sub_y" });
    console.log("⑥ 再契約         :", await state(fid));
    console.log("   再契約後の編集   :", await tryEdit(fid, "lunch", "あり（自家製）"));
  } finally {
    await prisma.facility.delete({ where: { id: fid } });
    console.log("（テスト事業所を削除しました）");
  }
}

main()
  .catch((e) => {
    console.error("失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
