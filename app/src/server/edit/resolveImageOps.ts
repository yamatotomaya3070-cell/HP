// 返信/チャット編集からの画像生成を解決する。
// AIが出した generate_image オペを、実際に画像生成→DB保存→URL化して
// set_hero_media / add_photo（URL入り）に置き換える。副作用（API・保存）を伴うため
// applyOps（純関数）ではなく、この前処理で解決する。
//
// 失敗時（キー未設定・生成エラー）はそのopをスキップし、他のopは適用させる（握りつぶさずログ）。

import type { EditOp } from "@/lib/editOps.js";
import { getImageGenerator, type ImageGenerator } from "@/server/media/imageGenerator.js";
import { saveGeneratedImage } from "@/server/media/imageStore.js";

export interface ResolveResult {
  ops: EditOp[];
  generated: number;
}

/** generate_image を実生成して具体的なメディアopへ解決する。 */
export async function resolveImageOps(
  facilityId: string,
  ops: EditOp[],
): Promise<ResolveResult> {
  const out: EditOp[] = [];
  let generated = 0;
  let gen: ImageGenerator | null = null;

  for (const op of ops) {
    if (op.op !== "generate_image") {
      out.push(op);
      continue;
    }
    try {
      if (!gen) gen = getImageGenerator(); // 未設定なら例外→このopはスキップ
      const aspect = op.target === "hero" ? "16:9" : "4:3";
      const { bytes } = await gen.generateFromPrompt(op.prompt, aspect);
      const maxWidth = op.target === "hero" ? 1280 : 900;
      const stored = await saveGeneratedImage(bytes, { facilityId, maxWidth });

      if (op.target === "hero") {
        out.push({ op: "set_hero_media", image: stored.url, imageAlt: op.alt ?? "" });
      } else {
        out.push({
          op: "add_photo",
          photo: { url: stored.url, alt: op.alt ?? "", caption: "" },
        });
      }
      generated += 1;
    } catch (e) {
      console.log(`画像生成スキップ(generate_image): ${(e as Error).message}`);
    }
  }

  return { ops: out, generated };
}
