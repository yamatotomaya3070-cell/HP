// トライアル終了通知メールの本文組立。事実の断定はせず、終了日・課金開始・操作リンクを伝える。
// マイルストーン: d3(3日前) / d1(前日) / d0(当日)。

export type TrialMilestone = "d3" | "d1" | "d0";

export interface TrialReminderCtx {
  facilityName: string;
  /** トライアル終了日時。 */
  endsAt: Date;
  /** 月額（円）。 */
  monthlyFee: number;
  /** 非公開プレビューURL（任意）。 */
  previewUrl?: string;
  /** 解約・支払い管理リンク（Stripe Customer Portal 等。確定後に注入）。 */
  manageUrl?: string;
}

function formatDate(d: Date): string {
  // 日本語の年月日（ローカルではなくUTC基準の暦日ズレを避けるため getFullYear 等を使用）。
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function leadLine(milestone: TrialMilestone, endsAt: Date): string {
  const date = formatDate(endsAt);
  switch (milestone) {
    case "d3":
      return `無料トライアルは3日後の${date}に終了します。`;
    case "d1":
      return `無料トライアルは明日${date}に終了します。`;
    case "d0":
      return `無料トライアルは本日${date}で終了します。`;
  }
}

/** マイルストーンに応じたトライアル終了通知を組み立てる。 */
export function composeTrialReminder(
  milestone: TrialMilestone,
  ctx: TrialReminderCtx,
): { subject: string; text: string } {
  const lines: string[] = [
    `${ctx.facilityName} ご担当者様`,
    "",
    "いつもご利用ありがとうございます。",
    leadLine(milestone, ctx.endsAt),
    `終了後は月額 ${ctx.monthlyFee.toLocaleString()} 円で、ホームページの公開とAI編集を継続してご利用いただけます。`,
    "",
    "このまま継続される場合、お手続きは不要です。",
  ];

  if (ctx.manageUrl) {
    lines.push(
      "継続をご希望でない場合は、下記からいつでも解約できます（解約後もホームページの公開は続きます）。",
      `▼ お支払い・解約の管理`,
      ctx.manageUrl,
    );
  } else {
    lines.push(
      "継続をご希望でない場合は、このメールにご返信ください。担当が解約のご案内をいたします。",
    );
  }

  if (ctx.previewUrl) {
    lines.push("", "▼ 現在のホームページ（非公開プレビュー）", ctx.previewUrl);
  }

  const subjectByMilestone: Record<TrialMilestone, string> = {
    d3: "【ホームページ】無料トライアル終了まであと3日のお知らせ",
    d1: "【ホームページ】無料トライアルは明日終了します",
    d0: "【ホームページ】本日、無料トライアルが終了します",
  };

  return { subject: subjectByMilestone[milestone], text: lines.join("\n") };
}
