// 受信メール→AI編集→自動返信ループを1通ぶんシミュレートする（オフライン検証）。
//   オフラインops(キー不要):
//     npm run mail-inbound -- --facilityNumber 2910103973 --ops '[{"op":"set_detail","field":"lunch","value":"あり（自家製の昼食）"}]'
//   自然文(要APIキー):
//     npm run mail-inbound -- --facilityNumber 2910103973 --text "昼食は自家製で提供しています"
import { prisma } from "@/lib/db.js";
import { handleInbound } from "@/server/mail/handleInbound.js";
import { DevMailProvider, type OutboundMessage } from "@/server/mail/provider.js";
import { buildReplyTo } from "@/server/mail/replyAddress.js";
import { createEditModel } from "@/server/edit/editModelFactory.js";
import { type EditModel } from "@/server/edit/editModel.js";
import { editProposalSchema } from "@/lib/editOps.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fixedModel(opsJson: string): EditModel {
  const proposal = editProposalSchema.parse({
    message: "ご指定の内容で更新しました。",
    ops: JSON.parse(opsJson),
  });
  return { proposeEdits: async () => proposal };
}

async function main() {
  const facilityNumber = arg("facilityNumber");
  const text = arg("text");
  const opsJson = arg("ops");
  const from = arg("from") ?? "owner@example-facility.jp";
  if (!facilityNumber) throw new Error("--facilityNumber が必要です");

  const facility = await prisma.facility.findUnique({
    where: { facilityNumber },
    select: { id: true, name: true },
  });
  if (!facility) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);

  // 実際に事業所へ送った営業メールの Reply-To を再現（宛先に識別トークンが載る）
  const replyTo = buildReplyTo(facility.id);

  let captured: OutboundMessage | null = null;
  const provider = new DevMailProvider((m) => (captured = m));
  const model: EditModel = opsJson ? fixedModel(opsJson) : createEditModel();

  const result = await handleInbound(
    {
      from,
      to: [replyTo],
      text: text ?? "(ops直指定)",
      subject: "Re: ホームページのご案内",
      messageId: `sim-${Date.now()}`,
    },
    { model, provider },
  );

  console.log(`事業所: ${facility.name}`);
  console.log(`処理結果: ${result.outcome} / 残り無料修正: ${result.remaining ?? "-"}`);
  console.log("──── 自動返信 ────");
  if (captured) {
    const m = captured as OutboundMessage;
    console.log(`To: ${m.to}`);
    console.log(`Reply-To: ${m.replyTo}`);
    console.log(`件名: ${m.subject}`);
    console.log(m.text);
  } else {
    console.log("(送信なし)");
  }
}

main()
  .catch((e) => {
    console.error("失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
