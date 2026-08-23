// 保存済み画像の配信。MediaAsset(DB) のバイト列を Content-Type 付きで返す。
// 画像は不変（同一idは同一内容）なので長期キャッシュを付与する。

import { prisma } from "@/lib/db.js";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { contentType: true, data: true },
  });
  if (!asset) {
    return new Response("Not found", { status: 404 });
  }
  const body = new Uint8Array(asset.data);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
