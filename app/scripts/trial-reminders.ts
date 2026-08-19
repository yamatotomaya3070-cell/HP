// トライアル終了通知の日次バッチをオフライン実行する（DevMailProviderで送信内容を表示）。
//   全active トライアルを対象に本日基準で実行:
//     npm run trial-reminders
//   基準日を指定して実行（テスト用。例: トライアル終了3日前に合わせる）:
//     npm run trial-reminders -- --now 2026-08-25
import { prisma } from "@/lib/db.js";
import { DevMailProvider, type OutboundMessage } from "@/server/mail/provider.js";
import { runTrialReminders } from "@/server/billing/trialReminders.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const nowArg = arg("now");
  const now = nowArg ? new Date(nowArg) : undefined;
  if (nowArg && Number.isNaN(now!.getTime())) {
    throw new Error(`--now の日付が不正です: ${nowArg}`);
  }

  const sent: OutboundMessage[] = [];
  const provider = new DevMailProvider((m) => sent.push(m));

  const outcomes = await runTrialReminders({ provider, now });

  console.log(`基準日: ${(now ?? new Date()).toISOString().slice(0, 10)}`);
  console.log(`対象トライアル: ${outcomes.length}件`);
  const summary: Record<string, number> = {};
  for (const o of outcomes) summary[o.reason] = (summary[o.reason] ?? 0) + 1;
  console.log("内訳:", summary);

  for (const m of sent) {
    console.log("──── 送信メール ────");
    console.log(`To: ${m.to}`);
    console.log(`Reply-To: ${m.replyTo}`);
    console.log(`件名: ${m.subject}`);
    console.log(m.text);
    console.log("");
  }
  if (!sent.length) console.log("(送信対象なし)");
}

main()
  .catch((e) => {
    console.error("失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
