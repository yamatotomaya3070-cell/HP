// ミドルウェア（Edge）。2つの役割:
//  1) 独自ドメイン（テナント）からのアクセスを公開配信ルート /site/<domain> へ書き換える（(B) 既存ドメイン公開）。
//  2) 管理画面 /admin を HTTP Basic 認証で保護する（仕様: 管理者は別途認証）。
// DB には触れない（ホスト判定とヘッダ処理のみ）。実際の事業所照合は /site/[domain] のページ側で行う。

import { NextResponse, type NextRequest } from "next/server";

export const config = {
  // 静的アセット・Next 内部・favicon を除く全リクエストで動かす。
  matcher: ["/((?!_next|favicon.ico).*)"],
};

/** アプリ本体のホスト（localhost / *.vercel.app / APP_BASE_URL のホスト / APP_HOST）。 */
function isAppHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".vercel.app")) return true;
  const hosts: string[] = [];
  try {
    hosts.push(new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").hostname);
  } catch {
    /* noop */
  }
  if (process.env.APP_HOST) hosts.push(process.env.APP_HOST.toLowerCase());
  return hosts.includes(h);
}

/** 長さリークを避けた簡易な定数時間比較。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="kizuna-admin", charset="UTF-8"' },
  });
}

function adminAuth(req: NextRequest): NextResponse {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return unauthorized();

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }
  const sep = decoded.indexOf(":");
  const inUser = sep >= 0 ? decoded.slice(0, sep) : "";
  const inPass = sep >= 0 ? decoded.slice(sep + 1) : "";
  if (safeEqual(inUser, user) && safeEqual(inPass, pass)) {
    return NextResponse.next();
  }
  return unauthorized();
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // 1) 独自ドメインからのアクセス → 公開配信ルートへ書き換え（全パスを事業所HPに向ける）。
  if (host && !isAppHost(host)) {
    const domain = host.split(":")[0].toLowerCase();
    return NextResponse.rewrite(new URL(`/site/${domain}`, url));
  }

  // 2) アプリ本体。/admin は Basic 認証。
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    return adminAuth(req);
  }
  return NextResponse.next();
}
