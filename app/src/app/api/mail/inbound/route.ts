// メール受信Webフック。署名検証 → 事業所特定 → AI編集 → 自動返信。
// 受信経路は2系統を自動判別:
//   - Cloudflare Email Worker からの転送 → x-inbound-signature(HMAC-SHA256 hex) を DevMailProvider で検証
//   - Resend inbound → svix-* 署名を Resend(getMailProvider) で検証
// いずれの場合も自動返信の「送信」は本番プロバイダ(getMailProvider=Resend)で行う。

import { NextResponse } from "next/server";
import {
  getMailProvider,
  DevMailProvider,
  MailProviderError,
  type MailProvider,
} from "@/server/mail/provider.js";
import { handleInbound } from "@/server/mail/handleInbound.js";
import { createEditModel } from "@/server/edit/editModelFactory.js";
import { type EditModel, EditModelError } from "@/server/edit/editModel.js";

export const dynamic = "force-dynamic";
// AI編集は画像生成(数十秒)を含むことがあるため実行時間上限を延長する。
export const maxDuration = 300;

export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  // 送信（自動返信）は本番プロバイダで行う。
  const sendProvider = getMailProvider();
  // 受信パーサは署名ヘッダで判定。Resend は svix-*、Cloudflare Worker は x-inbound-signature。
  const isSvix = "svix-signature" in headers || "svix-id" in headers;
  const parser: MailProvider = isSvix ? sendProvider : new DevMailProvider();

  // 署名検証・正規化（不正は 400/401 で拒否）
  let inbound;
  try {
    inbound = parser.parseInbound(raw, headers);
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
    const result = await handleInbound(inbound, { model, provider: sendProvider });
    return NextResponse.json({ ok: true, processed: true, ...result });
  } catch (e) {
    if (e instanceof EditModelError) {
      // AIの一時失敗。受理はしつつ未処理を返す。
      return NextResponse.json({ ok: true, processed: false, reason: e.kind });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
