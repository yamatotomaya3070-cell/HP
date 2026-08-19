// プレビューHPのスクリーンショット生成（Playwright / Chromium headless）。
// 非公開プレビューURLを撮影し、営業メールへの添付や管理画面のサムネイルに使う。
// ブラウザ未インストール時は明示エラー（握りつぶさない）。

import { chromium } from "playwright";

export interface CaptureOptions {
  /** 撮影対象URL（例: http://localhost:3000/preview/<slug>）。 */
  url: string;
  /** ビューポート。既定は 1280x800。 */
  viewport?: { width: number; height: number };
  /** ページ全体を撮るか（既定 true）。false ならファーストビューのみ。 */
  fullPage?: boolean;
  /** 読み込み待機のタイムアウト(ms)。既定 15000。 */
  timeoutMs?: number;
  /** 高解像度化（deviceScaleFactor）。既定 2。 */
  scale?: number;
}

export class ScreenshotError extends Error {
  constructor(message: string, readonly kind: "browser_missing" | "navigation_failed" | "capture_failed") {
    super(message);
    this.name = "ScreenshotError";
  }
}

/** URL を撮影して PNG の Buffer を返す。 */
export async function captureUrlPng(opts: CaptureOptions): Promise<Buffer> {
  const viewport = opts.viewport ?? { width: 1280, height: 800 };
  const fullPage = opts.fullPage ?? true;
  const timeout = opts.timeoutMs ?? 15_000;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    throw new ScreenshotError(
      `Chromium を起動できません（npx playwright install chromium を実行してください）: ${(e as Error).message}`,
      "browser_missing",
    );
  }

  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: opts.scale ?? 2,
    });
    const page = await context.newPage();
    try {
      await page.goto(opts.url, { waitUntil: "networkidle", timeout });
    } catch (e) {
      throw new ScreenshotError(`ページを読み込めません: ${opts.url} (${(e as Error).message})`, "navigation_failed");
    }
    const buf = await page.screenshot({ type: "png", fullPage });
    return buf;
  } catch (e) {
    if (e instanceof ScreenshotError) throw e;
    throw new ScreenshotError(`撮影に失敗しました: ${(e as Error).message}`, "capture_failed");
  } finally {
    await browser.close().catch(() => {});
  }
}

/** URL を撮影してファイルに保存し、保存先パスを返す。 */
export async function captureUrlToFile(opts: CaptureOptions & { outPath: string }): Promise<string> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const buf = await captureUrlPng(opts);
  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, buf);
  return opts.outPath;
}

/** URL を撮影して data: URI（base64）を返す。メール添付やインライン埋め込み用。 */
export async function captureUrlDataUri(opts: CaptureOptions): Promise<string> {
  const buf = await captureUrlPng(opts);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
