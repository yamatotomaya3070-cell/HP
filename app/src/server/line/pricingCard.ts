// 課金導線の Flex Message（料金カード）。
//
// 無料枠を使い切った「まさにその瞬間」に出すのが最も効く。テキストにURLを並べるより、
// 松竹梅が一目で分かるカード＋大きなボタンの方が、普通のサブスク登録と同じ感覚になる。
//
// 設計意図: 竹（¥5,000）を選ばせる。松は「隣にあると竹が安心に見える」役割なので、
// 実作業（プロ編集）は都度課金にして松に含めない。

import { MONTHLY_FEE, MONTHLY_FEE_PRO, TRIAL_DAYS } from "@/server/billing/lifecycle.js";

const COLOR = {
  text: "#1F2A24",
  muted: "#7A8B81",
  accent: "#2F855A",
  accentSoft: "#E6F2EA",
  line: "#E4EAE6",
  no: "#B9C4BE",
};

function planRow(label: string, ok: boolean): object {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: ok ? "✓" : "×",
        size: "sm",
        color: ok ? COLOR.accent : COLOR.no,
        flex: 0,
      },
      {
        type: "text",
        text: label,
        size: "sm",
        color: ok ? COLOR.text : COLOR.no,
        flex: 1,
      },
    ],
  };
}

function planBlock(
  name: string,
  price: string,
  rows: { label: string; ok: boolean }[],
  opts: { recommended?: boolean } = {},
): object {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    paddingAll: "12px",
    cornerRadius: "8px",
    backgroundColor: opts.recommended ? COLOR.accentSoft : "#FFFFFF",
    borderWidth: opts.recommended ? "2px" : "1px",
    borderColor: opts.recommended ? COLOR.accent : COLOR.line,
    contents: [
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: name, weight: "bold", size: "md", color: COLOR.text, flex: 1 },
          ...(opts.recommended
            ? [{ type: "text", text: "おすすめ", size: "xs", color: COLOR.accent, align: "end", flex: 0 }]
            : []),
        ],
      },
      { type: "text", text: price, weight: "bold", size: "xl", color: COLOR.text },
      ...rows.map((r) => planRow(r.label, r.ok)),
    ],
  };
}

/**
 * 料金カード（Flex Message）を組み立てる。
 * @param checkoutUrl 事業所ごとの決済リンク（/billing/<token>）
 */
export function buildPricingCard(checkoutUrl: string): object {
  return {
    type: "flex",
    altText: `プランのご案内（${TRIAL_DAYS}日間無料でお試しいただけます）`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "無料のお試しはここまでです",
            weight: "bold",
            size: "lg",
            color: COLOR.text,
            wrap: true,
          },
          {
            type: "text",
            text: `ご登録いただくと編集が使い放題になり、ホームページを公開できます。${TRIAL_DAYS}日間は無料です。`,
            size: "sm",
            color: COLOR.muted,
            wrap: true,
          },
          { type: "separator", margin: "md", color: COLOR.line },
          planBlock("梅", "¥0", [
            { label: "ホームページを見る", ok: true },
            { label: "AI編集（3回まで）", ok: true },
            { label: "編集し放題", ok: false },
            { label: "ホームページ公開", ok: false },
          ]),
          planBlock(
            "竹",
            `¥${MONTHLY_FEE.toLocaleString()}/月`,
            [
              { label: "編集し放題", ok: true },
              { label: "ホームページ公開", ok: true },
              { label: "プロに相談", ok: false },
            ],
            { recommended: true },
          ),
          planBlock("松", `¥${MONTHLY_FEE_PRO.toLocaleString()}/月`, [
            { label: "編集し放題", ok: true },
            { label: "ホームページ公開", ok: true },
            { label: "プロに相談できる", ok: true },
          ]),
          {
            type: "text",
            text: "※プロによる編集の実作業は都度10,000円（松プランは8,000円）です。",
            size: "xxs",
            color: COLOR.muted,
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: COLOR.accent,
            action: {
              type: "uri",
              label: `${TRIAL_DAYS}日間無料ではじめる`,
              uri: checkoutUrl,
            },
          },
          {
            type: "text",
            text: "いつでも解約できます。解約後もホームページは公開されたままです。",
            size: "xxs",
            color: COLOR.muted,
            align: "center",
            wrap: true,
          },
        ],
      },
    },
  };
}
