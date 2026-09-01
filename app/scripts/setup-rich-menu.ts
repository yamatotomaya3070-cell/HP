// リッチメニューの画像を生成して LINE に登録する。
//
// 画像は Playwright で HTML を 2500x1686 で撮影して作る（日本語フォントが確実に出るため。
// SVG→sharp のテキスト描画はフォント依存で崩れやすい）。
// タイル配置は richMenu.ts の TILES と一致させること。
//
// 使い方:
//   npm run rich-menu            … 画像生成＋登録＋既定に設定
//   npm run rich-menu -- --image-only [--out path]  … 画像だけ作って確認
//   npm run rich-menu -- --list  … 登録済み一覧
//   npm run rich-menu -- --clean … 既存メニューを全削除

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  MENU_WIDTH,
  MENU_HEIGHT,
  createRichMenu,
  uploadRichMenuImage,
  setDefaultRichMenu,
  listRichMenus,
  deleteRichMenu,
} from "@/server/line/richMenu.js";

interface Tile {
  title: string;
  sub: string;
  icon: string;
  dark: boolean;
}

/** 表示内容。richMenu.ts の TILES と同じ並び（左上→右上→左下→右下）。 */
const TILES: Tile[] = [
  { title: "料金プラン", sub: "7日間 無料でお試し", icon: "◎", dark: true },
  { title: "使い方", sub: "話しかけるだけ", icon: "✎", dark: false },
  { title: "プロに相談", sub: "担当者がお作りします", icon: "★", dark: false },
  { title: "よくある質問", sub: "料金・解約について", icon: "?", dark: true },
];

function buildHtml(): string {
  const cell = (t: Tile) => `
    <div class="tile ${t.dark ? "dark" : "light"}">
      <div class="icon">${t.icon}</div>
      <div class="title">${t.title}</div>
      <div class="sub">${t.sub}</div>
    </div>`;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      width:${MENU_WIDTH}px; height:${MENU_HEIGHT}px;
      display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr;
      gap:8px; background:#d8e4dc;
      font-family:"Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif;
    }
    .tile { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; }
    .dark  { background:#1f6f44; color:#fff; }
    .light { background:#fdfbf6; color:#1f2a24; }
    .icon  { font-size:150px; line-height:1; opacity:.9; }
    .dark .icon  { color:#ffd79a; }
    .light .icon { color:#2f8f5b; }
    .title { font-size:104px; font-weight:800; letter-spacing:.04em; }
    .sub   { font-size:52px; font-weight:600; opacity:.72; }
  </style></head><body>${TILES.map(cell).join("")}</body></html>`;
}

async function renderImage(): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: MENU_WIDTH, height: MENU_HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(buildHtml(), { waitUntil: "load" });
    // LINE の上限は 1MB。PNG で収まらない場合に備え JPEG も選べるようにしている。
    return await page.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  if (has("--list")) {
    const menus = await listRichMenus();
    console.log(menus.length === 0 ? "登録済みメニューはありません" : "登録済み:");
    for (const m of menus) console.log(`  ${m.richMenuId}  ${m.name}`);
    return;
  }

  if (has("--clean")) {
    const menus = await listRichMenus();
    for (const m of menus) {
      await deleteRichMenu(m.richMenuId);
      console.log(`削除: ${m.richMenuId} (${m.name})`);
    }
    console.log(`${menus.length}件を削除しました`);
    return;
  }

  console.log(`画像を生成中… (${MENU_WIDTH}x${MENU_HEIGHT})`);
  const png = await renderImage();
  console.log(`  生成: ${(png.length / 1024).toFixed(0)}KB`);
  if (png.length > 1024 * 1024) {
    throw new Error("画像が1MBを超えました。デザインを簡素化してください。");
  }

  const out = arg("--out") ?? path.resolve("rich-menu.png");
  await writeFile(out, png);
  console.log(`  保存: ${out}`);

  if (has("--image-only")) {
    console.log("画像のみ生成しました（--image-only）。確認後、フラグ無しで実行すると登録します。");
    return;
  }

  // 既存メニューを消してから貼り替える（同名が増殖しないように）。
  for (const m of await listRichMenus()) {
    await deleteRichMenu(m.richMenuId);
    console.log(`既存メニューを削除: ${m.richMenuId}`);
  }

  const id = await createRichMenu();
  console.log(`作成: ${id}`);
  await uploadRichMenuImage(id, png, "image/png");
  console.log("画像をアップロードしました");
  await setDefaultRichMenu(id);
  console.log("既定メニューに設定しました。LINEのトーク画面下部に表示されます。");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
