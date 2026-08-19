// 公開前確認API。publish トークンで認可し、確認チェック（全項目true）を検証して記録する。
// 実際の公開は 5,000円決済成功時（決済Webhook→lifecycle）に行う。ここは人手確認の記録のみ。

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken } from "@/lib/tokens.js";
import {
  prePublishConfirmSchema,
  recordPrePublishConfirm,
} from "@/server/publish/prePublish.js";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  confirm: prePublishConfirmSchema,
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    // 未チェック項目があると literal(true) 検証で落ちる。
    return NextResponse.json(
      { error: "すべての項目にご確認のうえチェックしてください" },
      { status: 400 },
    );
  }

  const auth = verifyToken(parsed.data.token, "publish");
  if (!auth.ok) {
    const msg =
      auth.reason === "expired"
        ? "確認リンクの有効期限が切れています"
        : "確認リンクが無効です";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const result = await recordPrePublishConfirm(auth.facilityId, parsed.data.confirm);
    return NextResponse.json({
      ok: true,
      alreadyPublished: result.alreadyPublished ?? false,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
