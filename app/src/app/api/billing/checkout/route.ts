// 決済Checkoutの開始（導線の入口）。署名トークンで事業所を特定し、
// getPaymentProvider()（Stripeキーがあれば本番、無ければStub）で Checkout を作成しリダイレクトする。
//   /api/billing/checkout?token=<billing token>[&type=trial|publish]
// type 既定は trial（カード登録＋14日体験＋サブスク）。publish は 5,000円の公開決済。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db.js";
import { verifyToken } from "@/lib/tokens.js";
import { getPaymentProvider } from "@/server/billing/provider.js";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const type = url.searchParams.get("type") === "publish" ? "publish" : "trial";

  const auth = verifyToken(token, "billing");
  if (!auth.ok) {
    return NextResponse.json({ error: "リンクが無効か期限切れです" }, { status: 401 });
  }

  const facility = await prisma.facility.findUnique({
    where: { id: auth.facilityId },
    select: { id: true, email: true },
  });
  if (!facility) {
    return NextResponse.json({ error: "事業所が見つかりません" }, { status: 404 });
  }

  const provider = getPaymentProvider();
  try {
    const checkout =
      type === "publish"
        ? await provider.createPublishCheckout({ facilityId: facility.id, amount: 5000 })
        : await provider.createTrialCheckout({
            facilityId: facility.id,
            email: facility.email ?? undefined,
          });
    if (!checkout.url) {
      return NextResponse.json({ error: "決済URLを取得できませんでした" }, { status: 502 });
    }
    // 事業所を決済ページへ誘導。
    return NextResponse.redirect(checkout.url, { status: 303 });
  } catch (e) {
    return NextResponse.json(
      { error: `決済の開始に失敗しました: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
