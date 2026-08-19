// 初回営業メールの本文組み立て。事実は断定せず、あくまで「営業提案用サンプル」の立ち位置を明示する。
// 特定電子メール法に配慮し、送信者情報の明示と配信停止リンクを必ず含める（呼び出し側で欠かせない）。
// 純関数（DB・ネットワーク非依存）＝単体テストで全経路を検証できる。

/** 送信者（事業者）情報。特定電子メール法の表示義務に対応。 */
export interface SalesSender {
  /** 送信者（事業者）名。必須。 */
  orgName: string;
  /** 所在地。 */
  address?: string;
  /** 問い合わせ先（メール／電話／URL のいずれか）。 */
  contact?: string;
}

export interface SalesEmailCtx {
  facilityName: string;
  /** 非公開プレビュー（サンプルHP）のURL。 */
  previewUrl: string;
  /** 配信停止ページのURL。 */
  unsubscribeUrl: string;
  sender: SalesSender;
}

/**
 * 初回営業メールの件名・本文を組み立てる。
 * 事実の断定はせず、返信で修正できる導線・送信者情報・配信停止リンクを含める。
 */
export function composeSalesEmail(ctx: SalesEmailCtx): { subject: string; text: string } {
  const { facilityName, previewUrl, unsubscribeUrl, sender } = ctx;

  const senderLines = [
    "――――――――――――――",
    `送信者: ${sender.orgName}`,
    ...(sender.address ? [`所在地: ${sender.address}`] : []),
    ...(sender.contact ? [`連絡先: ${sender.contact}`] : []),
  ];

  const lines = [
    `${facilityName} ご担当者様`,
    "",
    "突然のご連絡失礼いたします。",
    "就労継続支援B型事業所さま向けに、ホームページを無料でお作りし、",
    "メールのご返信だけで内容を編集できるサービスをご案内しております。",
    "",
    "公開されている情報をもとに、貴事業所さまのサンプルのホームページをご用意しました。",
    "下記のリンクからご覧いただけます（非公開・検索エンジンには表示されません）。",
    "",
    "▼ サンプルのホームページ",
    previewUrl,
    "",
    "「送迎ありに直して」「昼食のことを載せて」など、変更したい点をこのメールにご返信いただくだけで、",
    "AIが自動で修正します（無料で3回まで）。HTMLの編集や専門知識は一切不要です。",
    "",
    "※このサンプルは営業のご提案用に自動生成したものです。掲載内容に誤りがある場合は、ご返信でお知らせください。",
    "",
    ...senderLines,
    "",
    "今後このようなご案内が不要な場合は、下記より配信を停止できます。",
    unsubscribeUrl,
  ];

  return {
    subject: `【${facilityName}さま】ホームページのサンプルをご用意しました`,
    text: lines.join("\n"),
  };
}
