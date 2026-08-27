// LINE Messaging API の Webhook 受け口。
// 署名検証(x-line-signature) → 各イベントを handleLineEvent へ。
// 生成/画像は時間がかかるため maxDuration を延長。LINE には即 200 を返す。

import { NextResponse } from "next/server";
import { verifyLineSignature, isLineConfigured } from "@/server/line/client.js";
import { handleLineEvent, type LineEvent } from "@/server/line/handleLineEvent.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!isLineConfigured()) {
    // 未設定でも 200 を返す（LINE の検証リトライを防ぐ）。
    return NextResponse.json({ ok: true, configured: false });
  }
  if (!verifyLineSignature(raw, signature)) {
    return NextResponse.json({ error: "署名不正" }, { status: 401 });
  }

  let body: { events?: LineEvent[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "ペイロード不正" }, { status: 400 });
  }

  const events = body.events ?? [];
  // 各イベントを処理（1件失敗しても他を止めない）。
  await Promise.all(
    events.map((e) =>
      handleLineEvent(e).catch((err) =>
        console.log(`LINEイベント処理失敗: ${(err as Error).message}`),
      ),
    ),
  );

  return NextResponse.json({ ok: true });
}

// LINE の Webhook 検証（GET）にも 200 を返す。
export async function GET() {
  return NextResponse.json({ ok: true });
}
