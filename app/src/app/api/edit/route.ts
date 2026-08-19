// AI編集API。マジックリンクのトークンで認可し、自然文指示をエンジンへ渡す。
// 境界バリデーション必須（Zod）。モデル未設定/拒否は明示的にJSONで返す。

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken } from "@/lib/tokens.js";
import { runEdit } from "@/server/edit/runEdit.js";
import { createEditModel } from "@/server/edit/editModelFactory.js";
import { type EditModel, EditModelError } from "@/server/edit/editModel.js";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  instruction: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const auth = verifyToken(parsed.data.token, "edit");
  if (!auth.ok) {
    const msg =
      auth.reason === "expired"
        ? "編集リンクの有効期限が切れています"
        : "編集リンクが無効です";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  let model: EditModel;
  try {
    model = createEditModel();
  } catch (e) {
    // APIキー未設定など。UI が案内できるよう 503 で返す。
    return NextResponse.json(
      { error: (e as Error).message, kind: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const result = await runEdit(
      {
        facilityId: auth.facilityId,
        instruction: parsed.data.instruction,
        channel: "editor",
        actor: "facility",
      },
      model,
    );
    return NextResponse.json({
      applied: result.applied,
      appliedCount: result.appliedCount,
      rejected: result.rejected,
      message: result.message,
      slug: result.slug,
      versionId: result.versionId,
    });
  } catch (e) {
    if (e instanceof EditModelError) {
      const status = e.kind === "refused" ? 422 : 502;
      return NextResponse.json({ error: e.message, kind: e.kind }, { status });
    }
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
