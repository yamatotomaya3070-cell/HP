// 営業メール一斉配信の実行CLI（段階配信・テスト送信）。
//   テスト送信（自分の宛先にだけ・実データ非更新）:
//     npm run campaign-send -- --name "奈良テスト" --prefecture 奈良県 --limit 5 --test-to you@example.com
//   本番送信（HP生成済みの先頭300件へ）:
//     npm run campaign-send -- --name "奈良300" --prefecture 奈良県 --limit 300
// 実送信は実プロバイダ確定後に getMailProvider() が差し替わる。現在は DevMailProvider（ログ出力）。

import { prisma } from "@/lib/db.js";
import { getMailProvider } from "@/server/mail/provider.js";
import { runCampaign } from "@/server/mail/runCampaign.js";
import { type SalesSender } from "@/server/mail/composeSales.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function senderFromEnv(): SalesSender {
  const orgName = process.env.MAIL_SENDER_ORG ?? "合同会社絆";
  return {
    orgName,
    address: process.env.MAIL_SENDER_ADDRESS,
    contact: process.env.MAIL_SENDER_CONTACT,
  };
}

async function main() {
  const name = arg("name") ?? `campaign-${new Date().toISOString().slice(0, 10)}`;
  const prefecture = arg("prefecture");
  const limit = Number(arg("limit") ?? "0");
  const testTo = arg("test-to");
  if (!limit || limit < 1) {
    console.error("使い方: --name <名前> --limit <上限> [--prefecture <県>] [--test-to <宛先>]");
    process.exit(1);
  }

  const report = await runCampaign({
    provider: getMailProvider(),
    name,
    prefecture,
    limit,
    testTo,
    sender: senderFromEnv(),
  });

  const counts = report.results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`キャンペーン: ${name}${testTo ? `（テスト送信 → ${testTo}）` : ""}`);
  if (report.campaignId) console.log(`campaignId: ${report.campaignId}`);
  console.log(`送信: ${report.sent} 件 / 対象走査: ${report.results.length} 件`);
  console.log("内訳:", counts);
}

main()
  .catch((e) => {
    console.error("配信失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
