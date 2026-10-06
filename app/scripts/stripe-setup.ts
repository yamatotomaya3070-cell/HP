// Stripe の初期設定を自動で行う（ダッシュボード操作の代わり）。何度実行しても重複しない。
//   npm run stripe-setup
// 前提: app/.env に STRIPE_SECRET_KEY（sk_test_... または sk_live_...）が書かれていること。
// やること:
//   1) 月額プランの商品・価格を作成（通常 ¥5,000 / 上級 ¥7,000）
//   2) Webhook（決済の知らせを受け取る窓口）を APP_BASE_URL/api/payments/webhook に登録
//   3) 得られた ID・署名シークレットを app/.env に書き込む（値は画面に出さない）

import { readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";
import { MONTHLY_FEE, MONTHLY_FEE_PRO } from "@/server/billing/lifecycle.js";

const ENV_PATH = ".env";

// webhook ルートが処理するイベント（stripeProvider.mapStripeEvent と一致させる）
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "invoice.paid", // invoice.payment_succeeded は同じ支払いの重複通知なので購読しない
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "customer.subscription.resumed",
];

const PLANS = [
  { envKey: "STRIPE_PRICE_SUBSCRIPTION", lookupKey: "kizuna_standard_monthly", name: "通常プラン（月額）", amount: MONTHLY_FEE },
  { envKey: "STRIPE_PRICE_SUBSCRIPTION_PRO", lookupKey: "kizuna_pro_monthly", name: "上級プラン（月額）", amount: MONTHLY_FEE_PRO },
] as const;

/** .env の KEY=VALUE を置換（無ければ末尾に追加）した新しい文字列を返す。 */
function upsertEnv(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

async function ensurePrice(stripe: Stripe, plan: (typeof PLANS)[number]): Promise<string> {
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
  if (found.data[0]) {
    console.log(`✔ ${plan.name}: 既存の価格を使用`);
    return found.data[0].id;
  }
  const price = await stripe.prices.create({
    currency: "jpy",
    unit_amount: plan.amount, // 円は ×100 しない
    recurring: { interval: "month" },
    lookup_key: plan.lookupKey,
    product_data: { name: plan.name },
  });
  console.log(`＋ ${plan.name}: ¥${plan.amount.toLocaleString()}/月 を作成`);
  return price.id;
}

async function ensureWebhook(stripe: Stripe, url: string, hasSecret: boolean): Promise<string | undefined> {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === url);
  if (existing && hasSecret) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS });
    console.log("✔ Webhook: 既存の登録を使用（イベント一覧を更新）");
    return undefined;
  }
  // 署名シークレットは作成時にしか取得できないため、手元に無ければ作り直す
  if (existing) await stripe.webhookEndpoints.del(existing.id);
  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: "合同会社絆 HPサービス 決済通知",
  });
  console.log(`＋ Webhook: ${url} を登録`);
  return created.secret;
}

async function main() {
  process.loadEnvFile(ENV_PATH);
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const base = process.env.APP_BASE_URL;
  if (!secretKey?.startsWith("sk_")) {
    throw new Error("app/.env に STRIPE_SECRET_KEY=sk_... を書いてから実行してください");
  }
  if (!base?.startsWith("https://")) {
    throw new Error("APP_BASE_URL が https の公開URLではありません（Webhook登録に必要）");
  }
  const mode = secretKey.startsWith("sk_live_") ? "本番" : "テスト";
  console.log(`Stripe ${mode}モードで設定します\n`);

  const stripe = new Stripe(secretKey);
  let env = readFileSync(ENV_PATH, "utf8");

  for (const plan of PLANS) {
    env = upsertEnv(env, plan.envKey, await ensurePrice(stripe, plan));
  }

  const webhookUrl = `${base}/api/payments/webhook`;
  const whsec = await ensureWebhook(stripe, webhookUrl, Boolean(process.env.STRIPE_WEBHOOK_SECRET));
  if (whsec) env = upsertEnv(env, "STRIPE_WEBHOOK_SECRET", whsec);

  writeFileSync(ENV_PATH, env);
  console.log("\n✔ app/.env に STRIPE_PRICE_SUBSCRIPTION / _PRO / STRIPE_WEBHOOK_SECRET を書き込みました");
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
