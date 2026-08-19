// 変更履歴の取得(GET)と復元(POST)。マジックリンクのトークンで認可。

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken } from "@/lib/tokens.js";
import { listVersions, restoreVersion } from "@/server/edit/history.js";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const auth = verifyToken(token, "edit");
  if (!auth.ok) {
    return NextResponse.json({ error: "編集リンクが無効です" }, { status: 401 });
  }
  const versions = await listVersions(auth.facilityId);
  return NextResponse.json({ versions });
}

const restoreSchema = z.object({
  token: z.string().min(1),
  versionId: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = restoreSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  const auth = verifyToken(parsed.data.token, "edit");
  if (!auth.ok) {
    return NextResponse.json({ error: "編集リンクが無効です" }, { status: 401 });
  }
  try {
    const result = await restoreVersion(
      auth.facilityId,
      parsed.data.versionId,
      "facility",
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
