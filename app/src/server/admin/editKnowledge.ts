// 修正ナレッジ（要望3）: 事業所からの返信＝「何を直してほしいか」を集約する。
// EditRequest.rawInput(返信本文) と structured(AIが解釈したops) を人が読める形に整形。
// 事業所別の一覧＋「よくある修正」の横断集計を返す。

import { prisma } from "@/lib/db.js";

const DETAIL_LABELS: Record<string, string> = {
  corpName: "運営法人",
  address: "所在地",
  tel: "電話番号",
  fax: "FAX",
  url: "ウェブサイト",
  email: "メール",
  businessHours: "営業時間",
  holidays: "休業日",
  accessTransport: "送迎",
  lunch: "昼食",
  wage: "工賃",
};

const OP_LABELS: Record<string, string> = {
  set_hero: "見出し・キャッチ",
  set_hero_media: "ヒーロー画像",
  set_highlights: "バッジ",
  set_about: "紹介文",
  set_services: "サービス内容",
  set_work_content: "作業内容",
  set_daily_flow: "一日の流れ",
  set_access: "アクセス",
  add_photo: "写真追加",
  set_gallery: "写真ギャラリー",
  set_contact: "お問い合わせ",
  set_theme: "配色",
  reorder_sections: "並び替え",
  set_section_visibility: "表示切替",
};

/** 1つの EditOp を人が読めるラベルにする（集計キー）。 */
function summarizeOp(op: unknown): string {
  const o = (op ?? {}) as Record<string, unknown>;
  const name = typeof o.op === "string" ? o.op : "";
  if (name === "set_detail" || name === "clear_detail") {
    const field = typeof o.field === "string" ? o.field : "";
    return DETAIL_LABELS[field] ?? field ?? "詳細";
  }
  return OP_LABELS[name] ?? name ?? "その他";
}

export interface EditKnowledgeItem {
  id: string;
  facilityName: string;
  facilityNumber: string | null;
  createdAt: Date;
  rawInput: string;
  message: string;
  status: string;
  opLabels: string[];
}

export interface EditKnowledge {
  items: EditKnowledgeItem[];
  /** よくある修正（ラベル別件数・多い順）。 */
  topEdits: { label: string; count: number }[];
  total: number;
}

/** 修正ナレッジを集計して返す。 */
export async function getEditKnowledge(limit = 200): Promise<EditKnowledge> {
  const rows = await prisma.editRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { facility: { select: { name: true, facilityNumber: true } } },
  });

  const items: EditKnowledgeItem[] = rows.map((r) => {
    const structured = (r.structured ?? {}) as { ops?: unknown[]; message?: string };
    const ops = Array.isArray(structured.ops) ? structured.ops : [];
    return {
      id: r.id,
      facilityName: r.facility?.name ?? "(不明)",
      facilityNumber: r.facility?.facilityNumber ?? null,
      createdAt: r.createdAt,
      rawInput: r.rawInput,
      message: typeof structured.message === "string" ? structured.message : "",
      status: r.status,
      opLabels: ops.map(summarizeOp),
    };
  });

  const counts = new Map<string, number>();
  for (const it of items) {
    for (const label of it.opLabels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const topEdits = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return { items, topEdits, total: items.length };
}
