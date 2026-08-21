// 画像などのメディア保存先の抽象化（成果物B）。
// - 本番: Vercel Blob（環境変数 BLOB_READ_WRITE_TOKEN が必要）。公開URLを返す。
// - 開発: ローカルFS（app/public/uploads 配下）。/uploads/<name> のURLを返す。
// 既存の getMailProvider / getPaymentProvider と同じ env ゲート方式に倣う。

export interface StoredMedia {
  /** HP から参照できる公開URL（Blobの絶対URL or ローカルの /uploads/... ）。 */
  url: string;
  /** 保存キー（ファイル名）。 */
  key: string;
}

export interface MediaStore {
  /** バイト列を保存し、公開URLを返す。 */
  put(bytes: Uint8Array, contentType: string, key: string): Promise<StoredMedia>;
}

export class MediaStoreError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "put_failed",
  ) {
    super(message);
    this.name = "MediaStoreError";
  }
}

/** 拡張子付きの衝突しにくい保存キーを作る（純関数）。 */
export function mediaKey(prefix: string, contentType: string): string {
  const ext = extForContentType(contentType);
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "media";
  return `${safePrefix}-${stamp}${rand}.${ext}`;
}

/** contentType から拡張子を決める（未知は bin）。 */
export function extForContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
  };
  return map[contentType.toLowerCase()] ?? "bin";
}

/** Vercel Blob 保存。BLOB_READ_WRITE_TOKEN が必要。 */
class VercelBlobStore implements MediaStore {
  constructor(private readonly token: string) {}

  async put(bytes: Uint8Array, contentType: string, key: string): Promise<StoredMedia> {
    try {
      const { put } = await import("@vercel/blob");
      const result = await put(`uploads/${key}`, Buffer.from(bytes), {
        access: "public",
        contentType,
        token: this.token,
        addRandomSuffix: false,
      });
      return { url: result.url, key };
    } catch (e) {
      throw new MediaStoreError(
        `Vercel Blob への保存に失敗しました: ${(e as Error).message}`,
        "put_failed",
      );
    }
  }
}

/** 開発用ローカル保存。app/public/uploads に書き出し、/uploads/<key> を返す。
 *  ※本番の serverless FS は永続しないため本番はBlob必須。 */
class LocalMediaStore implements MediaStore {
  async put(bytes: Uint8Array, contentType: string, key: string): Promise<StoredMedia> {
    try {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { resolve, dirname } = await import("node:path");
      const outPath = resolve(process.cwd(), "public", "uploads", key);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, Buffer.from(bytes));
      return { url: `/uploads/${key}`, key };
    } catch (e) {
      throw new MediaStoreError(
        `ローカル保存に失敗しました: ${(e as Error).message}`,
        "put_failed",
      );
    }
  }
}

/** 環境に応じて保存先を選ぶ。BLOB トークンがあれば Blob、無ければローカル。 */
export function getMediaStore(): MediaStore {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && token.length > 0) return new VercelBlobStore(token);
  return new LocalMediaStore();
}

/** 本番用途で Blob が必須のとき、未設定なら明示的に失敗させる。 */
export function requireBlobStore(): MediaStore {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || token.length === 0) {
    throw new MediaStoreError(
      "BLOB_READ_WRITE_TOKEN が未設定です（本番の画像保存には Vercel Blob が必要）。",
      "not_configured",
    );
  }
  return new VercelBlobStore(token);
}
