// AI雰囲気画像を生成してメディアストアに保存し、公開URLと適用用の EditOp を出力するCLI（成果物B）。
// 人物画像は生成しない（imageGenerator の倫理ガードで拒否）。
//   npm run media-generate -- --kind workspace [--extra "窓辺の作業机"] [--as hero|gallery] [--aspect 16:9]
// 出力URLは、そのまま set_hero_media / add_photo の image に使える。
//   例) npm run edit -- --facilityNumber 2910103973 --ops '[{"op":"set_hero_media","image":"<URL>"}]'

import {
  ATMOSPHERE_KINDS,
  getImageGenerator,
  type AtmosphereKind,
  type GenerateImageSpec,
} from "@/server/media/imageGenerator.js";
import { getMediaStore, mediaKey } from "@/server/media/mediaStore.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const kind = arg("kind") as AtmosphereKind | undefined;
  if (!kind || !ATMOSPHERE_KINDS.includes(kind)) {
    console.error(`--kind は次のいずれか: ${ATMOSPHERE_KINDS.join(", ")}`);
    process.exit(1);
  }
  const spec: GenerateImageSpec = {
    kind,
    extra: arg("extra"),
    aspectRatio: (arg("aspect") as GenerateImageSpec["aspectRatio"]) ?? "4:3",
  };
  const as = arg("as"); // hero | gallery（適用 opの雛形出力用）

  const generator = getImageGenerator();
  const store = getMediaStore();

  console.log(`生成中… kind=${kind} aspect=${spec.aspectRatio}`);
  const { bytes, contentType } = await generator.generate(spec);
  const stored = await store.put(bytes, contentType, mediaKey(`gen-${kind}`, contentType));

  console.log(`保存URL: ${stored.url}`);
  if (as === "hero") {
    console.log(
      `適用op: [{"op":"set_hero_media","image":"${stored.url}","imageAlt":"${kind}の雰囲気画像"}]`,
    );
  } else if (as === "gallery") {
    console.log(
      `適用op: [{"op":"add_photo","photo":{"url":"${stored.url}","alt":"${kind}","caption":""}}]`,
    );
  }
}

main().catch((e) => {
  console.error("画像生成失敗:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
