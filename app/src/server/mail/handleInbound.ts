// 受信メール処理（Phase 5 の核）。Phase 3 の AI編集エンジンをそのまま共有する。
// 流れ: Reply-Toトークンで事業所特定 → 配信停止/無料上限チェック → runEdit → 自動返信送信 → 履歴記録。
// モデル・メールプロバイダは注入（テスト・無外部依存で全経路を検証可能）。

import { prisma } from "@/lib/db.js";
import { type EditModel } from "@/server/edit/editModel.js";
import { runEdit } from "@/server/edit/runEdit.js";
import { type InboundMessage, type MailProvider } from "./provider.js";
import { extractReplyToken } from "./replyAddress.js";
import { buildReplyTo } from "./replyAddress.js";
import { verifyToken } from "@/lib/tokens.js";
import { remainingFreeEdits, MAX_FREE_EMAIL_EDITS } from "./freeEdits.js";
import {
  composeAppliedReply,
  composeLimitReply,
  composeNoChangeReply,
} from "./compose.js";

export type InboundOutcome =
  | "ignored_no_token"
  | "ignored_unknown_facility"
  | "suppressed"
  | "limit_reached"
  | "applied"
  | "no_change";

export interface HandleInboundDeps {
  model: EditModel;
  provider: MailProvider;
  baseUrl?: string;
}

export interface HandleInboundResult {
  outcome: InboundOutcome;
  facilityId?: string;
  remaining?: number;
}

/** 送信＋受信/送信スレッドの記録をまとめて行う。 */
async function sendAndRecord(
  provider: MailProvider,
  facilityId: string,
  inbound: InboundMessage,
  reply: { subject: string; text: string },
): Promise<void> {
  const sent = await provider.send({
    to: inbound.from,
    replyTo: buildReplyTo(facilityId),
    subject: reply.subject,
    text: reply.text,
  });
  await prisma.emailThread.create({
    data: {
      facilityId,
      replyToken: `in-${inbound.messageId ?? Date.now()}`,
      direction: "inbound",
      subject: inbound.subject,
      body: inbound.text,
      messageId: inbound.messageId,
    },
  });
  await prisma.emailThread.create({
    data: {
      facilityId,
      replyToken: `out-${sent.messageId}`,
      direction: "outbound",
      subject: reply.subject,
      body: reply.text,
      messageId: sent.messageId,
    },
  });
}

/** 受信メール1通を処理する。 */
export async function handleInbound(
  inbound: InboundMessage,
  deps: HandleInboundDeps,
): Promise<HandleInboundResult> {
  const baseUrl = deps.baseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

  // 1) Reply-To トークンで事業所を特定
  const token = extractReplyToken(inbound.to);
  if (!token) return { outcome: "ignored_no_token" };
  const auth = verifyToken(token, "reply");
  if (!auth.ok) return { outcome: "ignored_no_token" };

  const site = await prisma.generatedSite.findFirst({
    where: { facilityId: auth.facilityId },
    orderBy: { createdAt: "asc" },
    include: { facility: true },
  });
  if (!site) return { outcome: "ignored_unknown_facility" };
  const facilityId = auth.facilityId;
  const facilityName = site.facility.name;

  // 受信を行動ログに記録（返信＝関心の強いシグナル）
  await prisma.leadEvent.create({
    data: { facilityId, type: "email_replied", meta: { messageId: inbound.messageId } },
  });

  // 2) 配信停止・受信拒否は横断で停止（送信もしない）
  const suppressed = await prisma.suppressionList.findUnique({
    where: { email: inbound.from },
  });
  if (suppressed) return { outcome: "suppressed", facilityId };

  // 3) 無料編集の上限チェック
  const remainingBefore = await remainingFreeEdits(facilityId);
  if (remainingBefore <= 0) {
    const reply = composeLimitReply({ facilityId, facilityName, slug: site.slug, baseUrl });
    await sendAndRecord(deps.provider, facilityId, inbound, reply);
    return { outcome: "limit_reached", facilityId, remaining: 0 };
  }

  // 4) AI編集（Phase 3 エンジンを共有）
  const result = await runEdit(
    { facilityId, instruction: inbound.text, channel: "email", actor: "facility" },
    deps.model,
  );

  const remaining = await remainingFreeEdits(facilityId);

  // 5) 結果に応じた自動返信
  if (result.applied) {
    // 状態を free_edit_N に更新（最大3）
    const used = MAX_FREE_EMAIL_EDITS - remaining;
    const statusMap = ["replied", "free_edit_1", "free_edit_2", "free_edit_3"] as const;
    await prisma.facility.update({
      where: { id: facilityId },
      data: { status: statusMap[Math.min(used, 3)] },
    });
    const reply = composeAppliedReply({
      facilityId,
      facilityName,
      slug: result.slug,
      baseUrl,
      aiMessage: result.message,
      remaining,
    });
    await sendAndRecord(deps.provider, facilityId, inbound, reply);
    return { outcome: "applied", facilityId, remaining };
  }

  const reply = composeNoChangeReply({
    facilityId,
    facilityName,
    slug: site.slug,
    baseUrl,
    aiMessage: result.message,
    remaining,
  });
  await sendAndRecord(deps.provider, facilityId, inbound, reply);
  return { outcome: "no_change", facilityId, remaining };
}
