// LINEイベント処理の中核。ヒアリング→生成→編集→エスカレーションを1本に束ねる。
// runEdit（全チャネル共通の編集エンジン）を通すため、解約ガード等の課金制御が自動で効く。

import { prisma } from "@/lib/db.js";
import { replyText, getProfile, getMessageContent } from "./client.js";
import {
  STEPS,
  type Step,
  type HearingDraft,
  type AdvanceContext,
  advance,
  isResetCommand,
  welcomeMessages,
  getOrCreateSession,
} from "./hearing.js";
import { findFacilityCandidates, isSelfBindable } from "./matchFacility.js";
import {
  MENU,
  type MenuCommand,
  parseMenuCommand,
  howtoMessages,
  faqMessages,
  proConsultMessages,
} from "./menuCommands.js";
import { generateRichSiteForFacility } from "@/server/generate/generateRichSite.js";
import { runEdit } from "@/server/edit/runEdit.js";
import { createEditModel } from "@/server/edit/editModelFactory.js";
import { saveGeneratedImage } from "@/server/media/imageStore.js";

const APP_BASE = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

/** LINE Webhook の1イベントを処理する。 */
export async function handleLineEvent(event: LineEvent): Promise<void> {
  if (event.type === "follow" && event.source?.userId) {
    await onFollow(event.source.userId, event.replyToken);
    return;
  }
  if (event.type !== "message" || !event.source?.userId || !event.replyToken) return;

  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const session = await getOrCreateSession(userId);

  // 画像メッセージ: アップロードを保存し、ドラフトに積む。
  if (event.message?.type === "image" && event.message.id) {
    await onImage(session.id, userId, event.message.id, replyToken, session.facilityId ?? undefined);
    return;
  }

  if (event.message?.type !== "text" || typeof event.message.text !== "string") return;
  const text = event.message.text;
  const step = session.step as Step;

  const draft = (session.draft ?? {}) as HearingDraft;

  // リッチメニューのタップは、ヒアリング/編集より先に処理する。
  // でないと「料金プラン」等が編集指示としてAIに渡ってしまう。
  const menu = parseMenuCommand(text);
  if (menu) {
    await onMenuCommand(menu, session.facilityId, userId, replyToken);
    return;
  }

  // 「やり直し」は編集モードからも効かせる（挨拶文で「いつでも」と案内しているため）。
  // 編集モードの分岐より前に置かないと、リセット指示がAI編集へ流れてしまう。
  // 既存の facilityId は保持する: 消すと当該事業所が保護対象から外れ、他人が名乗れてしまう。
  if (isResetCommand(text)) {
    const reset = advance(step, draft, text);
    await prisma.lineUser.update({
      where: { id: session.id },
      data: { step: reset.nextStep, draft: reset.draft as object },
    });
    await replyText(replyToken, reset.replies);
    return;
  }

  // 生成後は編集モード。
  if (step === STEPS.EDITING && session.facilityId) {
    await onEdit(session.facilityId, userId, text, replyToken);
    return;
  }

  // ヒアリング進行。名称の回答時だけ、収集済みリストと照合して候補を渡す。
  const ctx = await buildAdvanceContext(step, text);
  const result = advance(step, draft, text, ctx);
  await prisma.lineUser.update({
    where: { id: session.id },
    data: { step: result.nextStep, draft: result.draft as object },
  });
  await replyText(replyToken, result.replies);

  if (result.escalate) {
    await escalate(session.facilityId ?? null, userId, result.escalate.reason);
  }

  // 全項目そろったら生成を実行（reply後にpushで結果を返す）。
  if (result.triggerGenerate) {
    await runGenerate(session.id, userId, result.draft);
  }
}

/** 名称の回答時のみ収集リストを照合する（検索失敗は候補なしとして続行）。 */
async function buildAdvanceContext(step: Step, text: string): Promise<AdvanceContext> {
  const isNameStep = step === STEPS.ASK_NAME || step === STEPS.START;
  if (!isNameStep || isResetCommand(text)) return {};
  try {
    const found = await findFacilityCandidates(text);
    return {
      candidates: found.candidates.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        prefecture: c.prefecture,
        url: c.url,
      })),
      protectedMatchCount: found.protectedCount,
    };
  } catch (e) {
    console.log(`事業所照合に失敗（新規として続行）: ${(e as Error).message}`);
    return {};
  }
}

async function onFollow(userId: string, replyToken?: string): Promise<void> {
  const profile = await getProfile(userId);
  await getOrCreateSession(userId, profile?.displayName);
  await prisma.lineUser.update({
    where: { lineUserId: userId },
    data: { step: STEPS.ASK_NAME, displayName: profile?.displayName ?? null },
  });
  if (replyToken) await replyText(replyToken, welcomeMessages());
}

async function onImage(
  sessionId: string,
  userId: string,
  messageId: string,
  replyToken: string,
  facilityId?: string,
): Promise<void> {
  const bytes = await getMessageContent(messageId);
  if (!bytes) {
    await replyText(replyToken, ["画像を受け取れませんでした。もう一度お試しください。"]);
    return;
  }
  const stored = await saveGeneratedImage(bytes, { facilityId, maxWidth: 1280 });
  const session = await prisma.lineUser.findUnique({ where: { id: sessionId } });
  const draft = (session?.draft ?? {}) as HearingDraft;
  const ids = [...(draft.uploadedImageIds ?? []), stored.id];
  await prisma.lineUser.update({
    where: { id: sessionId },
    data: { draft: { ...draft, uploadedImageIds: ids } as object },
  });

  // 編集モードなら、その場でギャラリーに追加。
  if (session?.step === STEPS.EDITING && facilityId) {
    await addUploadedPhoto(facilityId, stored.url);
    await replyText(replyToken, ["お写真をホームページに追加しました📷"]);
  } else {
    await replyText(replyToken, ["お写真を受け取りました📷 ホームページ作成時に使用します。"]);
  }
}

async function runGenerate(
  sessionId: string,
  userId: string,
  draft: HearingDraft,
): Promise<void> {
  try {
    const facility = await ensureFacility(draft);
    await prisma.lineUser.update({
      where: { id: sessionId },
      data: { facilityId: facility.id, step: STEPS.EDITING },
    });
    // ヒアリングで本人が語った内容は最も確かな根拠なので、生成へ渡す。
    // AI画像は本人の希望に従う（写真アップとの併用も可）。既定は生成する。
    //
    // 実際の事業所写真はAIの雰囲気画像より価値が高いので、頂いた写真があれば
    // 1枚目を必ずヒーロー（最上部）に充て、AI画像はカード等に回す。
    // 以前はAI画像がヒーローを占め、実写真がページ最下部の小さなサムネイルに
    // 埋もれていたため「画像が反映されていない」ように見えていた。
    const uploadedIds = draft.uploadedImageIds ?? [];
    const heroFromUpload = uploadedIds.length > 0 ? `/api/media/${uploadedIds[0]}` : undefined;

    const r = await generateRichSiteForFacility(facility.id, {
      withImages: draft.useAiImages ?? true,
      ownerNotes: draft.jobInfo?.trim() || undefined,
      heroImageUrl: heroFromUpload,
    });

    // ヒーローに使った1枚を除き、残りをギャラリーへ。
    for (const id of heroFromUpload ? uploadedIds.slice(1) : uploadedIds) {
      await addUploadedPhoto(facility.id, `/api/media/${id}`);
    }

    const url = `${APP_BASE()}/preview/${r.slug}`;
    const { pushText } = await import("./client.js");
    await pushText(userId, [
      "ホームページが完成しました🎉",
      `▼ プレビュー\n${url}`,
      "内容はAIが自動作成したサンプルです。実際と異なる点は、このトークに送って直せます。\n例:「送迎ありに直して」「工賃は月平均〇円」「作業風景の写真を追加して」",
    ]);
  } catch (e) {
    const { pushText } = await import("./client.js");
    await pushText(userId, [
      "申し訳ありません、作成中にエラーが発生しました。担当者が確認します🙇",
    ]);
    console.log(`LINE生成失敗: ${(e as Error).message}`);
  }
}

/**
 * ドラフトから Facility を確定する。
 * 照合で本人確認が取れていれば収集済みレコードを再利用し（住所/TEL/法人名を活かす）、
 * 無ければ新規作成する。
 */
async function ensureFacility(draft: HearingDraft) {
  if (draft.matchedFacilityId) {
    // 多層防御: 候補提示から確定までの間に持ち主が確定していないか再確認する。
    // 保護対象になっていたら、その事業所には一切書き込まず新規作成にフォールバックする。
    const bindable = await isSelfBindable(draft.matchedFacilityId);
    if (!bindable) {
      console.log(
        `紐付けを拒否（保護対象の事業所）: ${draft.matchedFacilityId} → 新規作成にフォールバック`,
      );
    }
    const existing = bindable
      ? await prisma.facility.findUnique({ where: { id: draft.matchedFacilityId } })
      : null;
    if (existing) {
      // ヒアリングで得たURLは、収集データが空のときだけ補う（既存の事実を上書きしない）。
      if (draft.url && !existing.url) {
        return prisma.facility.update({
          where: { id: existing.id },
          data: { url: draft.url },
        });
      }
      return existing;
    }
    if (bindable) {
      console.log(`照合済み事業所が見つかりません（新規作成へ）: ${draft.matchedFacilityId}`);
    }
  }

  const name = draft.name?.trim() || "事業所";
  const facilityNumber = `line-${Date.now()}`;
  return prisma.facility.create({
    data: {
      facilityNumber,
      name,
      url: draft.url || null,
      prefecture: null,
      emailStatus: "unknown",
      dedupKey: `line-${name}-${facilityNumber}`,
      status: "imported",
    },
  });
}

async function onEdit(
  facilityId: string,
  userId: string,
  text: string,
  replyToken: string,
): Promise<void> {
  // 「大きい要求/困りごと」の明示的エスカレーション。
  if (/(担当者|オペレータ|人間|電話|問い合わせ|できない|難しい)/.test(text) && text.length < 30) {
    await escalate(facilityId, userId, text);
    await replyText(replyToken, [
      "承知しました。担当者に共有しました。追ってご連絡いたします🙇",
    ]);
    return;
  }

  try {
    const model = createEditModel();
    const result = await runEdit(
      {
        facilityId,
        instruction: text,
        channel: "line",
        actor: "facility",
      },
      model,
    );
    // 無料枠を使い切ったら、その場で料金カードを出す（課金導線）。
    if (result.blockedReason === "free_limit") {
      await sendPricingCard(facilityId, replyToken, result.message);
      return;
    }

    if (result.applied) {
      const url = `${APP_BASE()}/preview/${result.slug}`;
      const texts = [result.message || "反映しました！", `▼ 更新後のプレビュー\n${url}`];
      // 残り回数は見えて初めて効くので、無料プランでは毎回伝える。
      if (result.remainingFreeEdits !== undefined) {
        texts.push(
          result.remainingFreeEdits > 0
            ? `あと${result.remainingFreeEdits}回、無料で修正できます。`
            : "無料でお試しいただける修正は、これで終了です。次からはご登録が必要になります。",
        );
      }
      await replyText(replyToken, texts);
    } else {
      await replyText(replyToken, [
        result.message ||
          "うまく変更できませんでした。別の言い方でお試しください。難しい場合は「担当者」と送ってください。",
      ]);
    }
  } catch (e) {
    // 解約ガード等でエンジンが拒否した場合を含む。
    const msg = (e as Error).message ?? "";
    if (/static|解約|停止|編集できません|not.*allowed/i.test(msg)) {
      await replyText(replyToken, [
        "現在、ご契約が終了しているため編集を停止しています。",
        "再開をご希望の場合は「再契約」と送ってください（担当者よりご案内します）。",
      ]);
      if (/再契約|再開/.test(text)) await escalate(facilityId, userId, "再契約希望");
      return;
    }
    await replyText(replyToken, ["エラーが発生しました。少し時間をおいてお試しください。"]);
    console.log(`LINE編集失敗: ${msg}`);
  }
}

/** アップロード/生成画像URLをギャラリーに1枚追加（runEditを介さず直接・安全なop）。 */
async function addUploadedPhoto(facilityId: string, url: string): Promise<void> {
  const { applyOps } = await import("@/server/edit/applyOps.js");
  const { siteDataSchema } = await import("@/lib/siteData.js");
  const site = await prisma.generatedSite.findFirst({
    where: { facilityId },
    orderBy: { createdAt: "asc" },
    include: { currentVersion: true },
  });
  if (!site?.currentVersion) return;
  const parsed = siteDataSchema.safeParse(site.currentVersion.data);
  if (!parsed.success) return;
  const { data, appliedCount } = applyOps(parsed.data, [
    { op: "add_photo", photo: { url, alt: "事業所の写真", caption: "" } },
  ]);
  if (appliedCount === 0) return;
  const v = await prisma.siteVersion.create({
    data: { siteId: site.id, facilityId, data, origin: "manual", note: "LINE画像追加" },
    select: { id: true },
  });
  await prisma.generatedSite.update({
    where: { id: site.id },
    data: { currentVersionId: v.id },
  });
}

/** リッチメニューのタップに応答する。 */
async function onMenuCommand(
  menu: MenuCommand,
  facilityId: string | null,
  userId: string,
  replyToken: string,
): Promise<void> {
  switch (menu) {
    case MENU.PRICING: {
      // 事業所が未確定なら決済リンクを出せないので、先にヒアリングへ案内する。
      if (!facilityId) {
        await replyText(replyToken, [
          "まずはホームページをお作りします🌱",
          "事業所の名称を教えてください。作成後、プランをご案内します。",
        ]);
        return;
      }
      await sendPricingCard(facilityId, replyToken);
      return;
    }
    case MENU.HOWTO:
      await replyText(replyToken, howtoMessages());
      return;
    case MENU.FAQ:
      await replyText(replyToken, faqMessages());
      return;
    case MENU.PRO: {
      await replyText(replyToken, proConsultMessages());
      await escalate(facilityId, userId, "リッチメニューから「プロに相談」");
      return;
    }
  }
}

/** 料金カード（Flex）を、その事業所専用の決済リンク付きで送る。 */
async function sendPricingCard(
  facilityId: string,
  replyToken: string,
  leadText?: string,
): Promise<void> {
  const { issueToken } = await import("@/lib/tokens.js");
  const { buildPricingCard } = await import("./pricingCard.js");
  const { replyMessages } = await import("./client.js");

  const token = issueToken(facilityId, "billing", 60 * 60 * 24 * 30);
  const card = buildPricingCard(`${APP_BASE()}/billing/${token}`);

  const messages: unknown[] = leadText ? [{ type: "text", text: leadText }, card] : [card];
  await replyMessages(replyToken, messages);
}

/** 対応できない要望を運営へエスカレーション（監査ログ＋任意で運営LINE通知）。
 *  facilityId は未確定（紐付け前の本人確認待ちなど）なら null。 */
async function escalate(
  facilityId: string | null,
  userId: string,
  text: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      facilityId,
      action: "line.escalation",
      actor: "facility",
      after: { lineUserId: userId, text },
    },
  });
  const opUserId = process.env.LINE_OPERATOR_USER_ID;
  if (opUserId) {
    const { pushText } = await import("./client.js");
    const who = facilityId ? `事業所ID ${facilityId}` : `未紐付け（LINE ${userId}）`;
    await pushText(opUserId, [`【要対応】${who}\n内容: ${text}`]);
  }
}

// ── LINE Webhook イベント型（必要分のみ） ──
export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type?: string; id?: string; text?: string };
}
