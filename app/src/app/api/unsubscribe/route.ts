// 配信停止（オプトアウト）の実処理。POST のみ（メールスキャナの先読みGETで誤停止しないよう確認ページ経由）。
// トークン検証 → suppression_list に登録（横断停止）→ 事業所を suppressed に → 行動ログ。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db.js";
import { verifyUnsubscribeToken } from "@/server/mail/unsubscribe.js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: "ペイロード不正" }, { status: 400 });
  }
  if (typeof token !== "string") {
    return NextResponse.json({ error: "token が必要です" }, { status: 400 });
  }

  const auth = verifyUnsubscribeToken(token);
  if (!auth.ok) {
    return NextResponse.json({ error: "リンクが無効か期限切れです" }, { status: 400 });
  }

  const facility = await prisma.facility.findUnique({ where: { id: auth.facilityId } });
  if (!facility) {
    return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
  }

  // すでに停止済みなら冪等に成功を返す。
  if (facility.email) {
    await prisma.suppressionList.upsert({
      where: { email: facility.email },
      create: { email: facility.email, reason: "unsubscribe", facilityId: facility.id },
      update: {},
    });
  }
  await prisma.facility.update({
    where: { id: facility.id },
    data: { status: "suppressed" },
  });
  await prisma.leadEvent.create({
    data: { facilityId: facility.id, type: "suppressed", meta: { via: "unsubscribe_link" } },
  });

  return NextResponse.json({ ok: true });
}
