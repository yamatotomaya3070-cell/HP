// 自動返信メール本文の組み立て。事実の断定はせず、結果・残回数・リンクを伝える。

import { issueToken } from "@/lib/tokens.js";

interface BaseCtx {
  facilityId: string;
  facilityName: string;
  slug: string;
  baseUrl: string;
}

function previewUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/preview/${slug}`;
}

function editorUrl(baseUrl: string, facilityId: string): string {
  const token = issueToken(facilityId, "edit", 7 * 24 * 60 * 60);
  return `${baseUrl}/edit/${token}`;
}

/** 編集が反映できたときの返信。残回数と確認リンクを添える。 */
export function composeAppliedReply(
  ctx: BaseCtx & { aiMessage: string; remaining: number },
): { subject: string; text: string } {
  const lines = [
    `${ctx.facilityName} ご担当者様`,
    "",
    "ご返信ありがとうございます。いただいた内容でホームページを更新しました。",
    "",
    ctx.aiMessage,
    "",
    `▼ 更新後のプレビュー（非公開）`,
    previewUrl(ctx.baseUrl, ctx.slug),
    "",
    ctx.remaining > 0
      ? `無料での修正は、あと ${ctx.remaining} 回ご利用いただけます。このメールにご返信ください。`
      : "無料での修正は今回で上限に達しました。続きは下記の編集画面からご自身で調整いただけます。",
    "",
    `▼ ご自身で編集する（AIチャット・7日間有効）`,
    editorUrl(ctx.baseUrl, ctx.facilityId),
  ];
  return {
    subject: "【ホームページ】ご依頼の内容を反映しました",
    text: lines.join("\n"),
  };
}

/** 反映できる変更が無かったときの返信。 */
export function composeNoChangeReply(
  ctx: BaseCtx & { aiMessage: string; remaining: number },
): { subject: string; text: string } {
  const lines = [
    `${ctx.facilityName} ご担当者様`,
    "",
    "ご返信ありがとうございます。",
    ctx.aiMessage,
    "",
    "もう一度、変更したい項目を具体的にご返信いただけますでしょうか。",
    `（残りの無料修正: ${ctx.remaining} 回）`,
    "",
    `▼ 現在のプレビュー`,
    previewUrl(ctx.baseUrl, ctx.slug),
  ];
  return { subject: "【ホームページ】ご依頼について確認させてください", text: lines.join("\n") };
}

/** 無料回数を使い切っているときの返信（編集画面へ誘導）。 */
export function composeLimitReply(
  ctx: BaseCtx,
): { subject: string; text: string } {
  const lines = [
    `${ctx.facilityName} ご担当者様`,
    "",
    "いつもありがとうございます。メールでの無料修正は上限（3回）に達しました。",
    "続きは、下記の編集画面からAIチャットでご自由に調整いただけます。",
    "",
    `▼ ご自身で編集する（7日間有効）`,
    editorUrl(ctx.baseUrl, ctx.facilityId),
    "",
    `▼ 現在のプレビュー`,
    previewUrl(ctx.baseUrl, ctx.slug),
  ];
  return { subject: "【ホームページ】編集画面のご案内", text: lines.join("\n") };
}
