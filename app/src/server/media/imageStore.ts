// 生成/アップロード画像を圧縮してDBに保存し、配信URL(/api/media/[id])を返す。
// 生成は手元バッチ、配信はサーバーレスという構成に合わせた本番向け画像ホスティング
// （Vercel Blob 未導入でも動く。将来 Blob へ差し替え可能）。

import sharp from "sharp";
import { prisma } from "@/lib/db.js";

export interface StoredImage {
  id: string;
  url: string; // 例: /api/media/<id>
  width?: number;
  height?: number;
}

export interface SaveImageOptions {
  facilityId?: string;
  /** 最大横幅。既定 1280px（ヒーロー用）。カードは 800 程度で呼ぶ。 */
  maxWidth?: number;
  /** WebP 品質(1-100)。既定 72。 */
  quality?: number;
}

/** 画像バイト列を WebP に圧縮・リサイズしてDBへ保存し、配信URLを返す。 */
export async function saveGeneratedImage(
  bytes: Uint8Array,
  opts: SaveImageOptions = {},
): Promise<StoredImage> {
  const maxWidth = opts.maxWidth ?? 1280;
  const quality = opts.quality ?? 72;

  const webp = await sharp(Buffer.from(bytes))
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  const meta = await sharp(webp).metadata();

  const asset = await prisma.mediaAsset.create({
    data: {
      facilityId: opts.facilityId ?? null,
      contentType: "image/webp",
      data: new Uint8Array(webp),
      width: meta.width ?? null,
      height: meta.height ?? null,
    },
    select: { id: true, width: true, height: true },
  });

  return {
    id: asset.id,
    url: `/api/media/${asset.id}`,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
  };
}
