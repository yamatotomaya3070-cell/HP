// 決済Webフック。署名検証 → 正規化 → 状態機械へ（冪等）。
// プロバイダ確定前は Stub（署名は STRIPE_WEBHOOK_SECRET があれば検証）。

import { NextResponse } from "next/server";
import { getPaymentProvider, PaymentProviderError } from "@/server/billing/provider.js";
import { processPaymentEvent } from "@/server/billing/lifecycle.js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const provider = getPaymentProvider();

  let event;
  try {
    event = provider.parseWebhook(raw, headers);
  } catch (e) {
    if (e instanceof PaymentProviderError && e.kind === "bad_signature") {
      return NextResponse.json({ error: "署名不正" }, { status: 401 });
    }
    return NextResponse.json({ error: "ペイロード不正" }, { status: 400 });
  }

  try {
    const outcome = await processPaymentEvent(event);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
