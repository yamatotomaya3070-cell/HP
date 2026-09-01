// リッチメニュー（トーク下部の常設タイル）の定義と登録。
//
// タイルは全て「メッセージを送る」アクションにしてある。URLアクションだと全員が同じURLに
// 飛んでしまい、事業所ごとの決済リンク（署名トークン付き）を出せないため。
// 送られた文言は menuCommands.ts が受け、Botが個別リンクを返す。
//
// 登録手順（LINE Messaging API）:
//   1. POST /v2/bot/richmenu            … 定義を作成 → richMenuId
//   2. POST /v2/bot/richmenu/{id}/content (api-data) … 画像をアップロード
//   3. POST /v2/bot/user/all/richmenu/{id} … 全ユーザーの既定に設定

import { MENU } from "./menuCommands.js";

const API = "https://api.line.me/v2/bot";
const API_DATA = "https://api-data.line.me/v2/bot";

/** リッチメニューの標準サイズ（2x2 グリッド）。 */
export const MENU_WIDTH = 2500;
export const MENU_HEIGHT = 1686;
const TILE_W = MENU_WIDTH / 2;
const TILE_H = MENU_HEIGHT / 2;

/** タイル配置。画像デザインと必ず一致させること。 */
export const TILES = [
  { label: MENU.PRICING, x: 0, y: 0 },
  { label: MENU.HOWTO, x: TILE_W, y: 0 },
  { label: MENU.PRO, x: 0, y: TILE_H },
  { label: MENU.FAQ, x: TILE_W, y: TILE_H },
] as const;

/** LINE に渡すリッチメニュー定義。 */
export function buildRichMenuDefinition(): object {
  return {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: "kizuna-main-menu",
    chatBarText: "メニュー",
    areas: TILES.map((t) => ({
      bounds: { x: t.x, y: t.y, width: TILE_W, height: TILE_H },
      action: { type: "message", text: t.label },
    })),
  };
}

function token(): string {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN 未設定");
  return t;
}

async function expectOk(res: Response, what: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} に失敗: ${res.status} ${body}`);
  }
}

/** リッチメニューを作成して richMenuId を返す。 */
export async function createRichMenu(): Promise<string> {
  const res = await fetch(`${API}/richmenu`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildRichMenuDefinition()),
  });
  await expectOk(res, "リッチメニューの作成");
  const json = (await res.json()) as { richMenuId: string };
  return json.richMenuId;
}

/** リッチメニューの画像をアップロードする（PNG/JPEG・1MB以下）。 */
export async function uploadRichMenuImage(
  richMenuId: string,
  image: Uint8Array,
  contentType: "image/png" | "image/jpeg" = "image/png",
): Promise<void> {
  const res = await fetch(`${API_DATA}/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": contentType },
    body: Buffer.from(image),
  });
  await expectOk(res, "リッチメニュー画像のアップロード");
}

/** 全ユーザーの既定リッチメニューに設定する。 */
export async function setDefaultRichMenu(richMenuId: string): Promise<void> {
  const res = await fetch(`${API}/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
  });
  await expectOk(res, "既定リッチメニューの設定");
}

/** 登録済みリッチメニューの一覧。 */
export async function listRichMenus(): Promise<{ richMenuId: string; name: string }[]> {
  const res = await fetch(`${API}/richmenu/list`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  await expectOk(res, "リッチメニュー一覧の取得");
  const json = (await res.json()) as { richmenus?: { richMenuId: string; name: string }[] };
  return json.richmenus ?? [];
}

/** リッチメニューを削除する（貼り替え時の後始末）。 */
export async function deleteRichMenu(richMenuId: string): Promise<void> {
  const res = await fetch(`${API}/richmenu/${richMenuId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` },
  });
  await expectOk(res, "リッチメニューの削除");
}
