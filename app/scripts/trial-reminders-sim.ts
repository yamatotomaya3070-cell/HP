// トライアル終了通知を、自己完結のテスト事業所で通しで検証する（オフライン・末尾で削除）。
// 検証: 3日前/前日/当日に1通ずつ・対象外日は無送信・二度目の実行は冪等（already_sent）。
//   npm run trial-reminders-sim
import { prisma } from "@/lib/db.js";
import { generateSiteForFacility } from "@/server/generate/generateSite.js";
import { processPaymentEvent } from "@/server/billing/lifecycle.js";
import { DevMailProvider, type OutboundMessage } from "@/server/mail/provider.js";
import { runTrialReminders } from "@/server/billing/trialReminders.js";

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

async function run(label: string, now: Date, expectSend: boolean) {
  const sent: OutboundMessage[] = [];
  const provider = new DevMailProvider((m) => sent.push(m));
  const outcomes = await runTrialReminders({ provider, now });
  const mine = outcomes[0];
  const mark = sent.length === (expectSend ? 1 : 0) ? "✓" : "✗ 期待と不一致";
  console.log(
    `${label} (${now.toISOString().slice(0, 10)}): reason=${mine?.reason} 送信=${sent.length}通 ${mark}`,
  );
  if (sent.length) console.log(`   件名: ${sent[0].subject}`);
}

async function main() {
  const num = `SIM-TR-${Date.now()}`;
  const facility = await prisma.facility.create({
    data: {
      facilityNumber: num,
      name: "通知シミュレーション事業所",
      dedupKey: num,
      status: "imported",
      email: "owner@example-sim.jp",
    },
  });
  const fid = facility.id;
  try {
    await generateSiteForFacility(fid);
    await processPaymentEvent({ type: "trial_started", eventId: `e-${num}`, facilityId: fid, subscriptionId: `sub-${num}` });

    const trial = await prisma.trial.findFirstOrThrow({ where: { facilityId: fid, state: "active" } });
    const endsAt = trial.endsAt;
    console.log(`トライアル終了日: ${endsAt.toISOString().slice(0, 10)}\n`);

    await run("2日前(対象外)", addDays(endsAt, -2), false);
    await run("3日前(d3)   ", addDays(endsAt, -3), true);
    await run("3日前 再実行 ", addDays(endsAt, -3), false); // 冪等: 二度目は送らない
    await run("前日(d1)    ", addDays(endsAt, -1), true);
    await run("当日(d0)    ", endsAt, true);

    const total = await prisma.trialReminder.count({ where: { facilityId: fid } });
    console.log(`\n送信記録(trial_reminders): ${total}件（d3/d1/d0 の3件が期待値）`);
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
