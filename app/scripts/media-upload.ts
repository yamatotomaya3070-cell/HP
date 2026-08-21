// 事業所の実写真をメディアストアへアップロードし、公開URLと適用用 EditOp を出力するCLI（成果物B）。
// 「事業所アップロード」経路。実写真が最も本物＝この経路を第一に使う。
//   npm run media-upload -- --file ./photos/room.jpg [--as hero|gallery] [--alt "作業室"]
// 出力URLは set_hero_media / add_photo の image にそのまま使える。

import { getMediaStore, mediaKey } from "@/server/media/mediaStore.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 拡張子から contentType を推定する。 */
function contentTypeForPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}

async function main() {
  const file = arg("file");
  if (!file) {
    console.error("使い方: --file <画像パス> [--as hero|gallery] [--alt <代替テキスト>]");
    process.exit(1);
  }
  const contentType = contentTypeForPath(file);
  if (!contentType.startsWith("image/")) {
    console.error(`画像ファイルを指定してください（拡張子から判定不可: ${file}）`);
    process.exit(1);
  }
  const { readFile } = await import("node:fs/promises");
  const bytes = new Uint8Array(await readFile(file));

  const store = getMediaStore();
  const stored = await store.put(bytes, contentType, mediaKey("upload", contentType));

  const alt = arg("alt") ?? "";
  const as = arg("as");
  console.log(`保存URL: ${stored.url}`);
  if (as === "hero") {
    console.log(
      `適用op: [{"op":"set_hero_media","image":"${stored.url}","imageAlt":"${alt}"}]`,
    );
  } else if (as === "gallery") {
    console.log(
      `適用op: [{"op":"add_photo","photo":{"url":"${stored.url}","alt":"${alt}","caption":""}}]`,
    );
  }
}

main().catch((e) => {
  console.error("アップロード失敗:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
