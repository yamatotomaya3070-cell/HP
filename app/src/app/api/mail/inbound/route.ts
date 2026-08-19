// メール受信Webフック。署名検証 → 事業所特定 → AI編集 → 自動返信。
// プロバイダ確定前は DevMailProvider（署名は MAIL_INBOUND_WEBHOOK_SECRET があれば検証）。

import { NextResponse } from "next/server";
import { getMailProvider, MailProviderError } from "@/server/mail/provider.js";
import { handleInbound } from "@/server/mail/handleInbound.js";
import { createEditModel } from "@/server/edit/editModelFactory.js";
import { type EditModel, EditModelError } from "@/server/edit/editModel.js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const provider = getMailProvider();

  // 署名検証・正規化（不正は 400/401 で拒否）
  let inbound;
  try {
    inbound = provider.parseInbound(raw, headers);
  } catch (e) {
    if (e instanceof MailProviderError && e.kind === "bad_signature") {
      return NextResponse.json({ error: "署名不正" }, { status: 401 });
    }
    return NextResponse.json({ error: "ペイロード不正" }, { status: 400 });
  }

  // モデル未設定でも Webフックは受理(200)し、処理不可を明示（プロバイダの再送を防ぐ）
  let model: EditModel;
  try {
    model = createEditModel();
  } catch {
    return NextResponse.json({ ok: true, processed: false, reason: "ai_not_configured" });
  }

  try {
    const result = await handleInbound(inbound, { model, provider });
    return NextResponse.json({ ok: true, processed: true, ...result });
  } catch (e) {
    if (e instanceof EditModelError) {
      // AIの一時失敗。受理はしつつ未処理を返す。
      return NextResponse.json({ ok: true, processed: false, reason: e.kind });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
