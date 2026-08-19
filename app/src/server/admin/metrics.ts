// 管理ダッシュボードの集計（仕様7）。都道府県別KPI・本命スコア・決済失敗一覧。
// 既存テーブル（facilities / lead_events / payments）を読むだけ（副作用なし）。

import { prisma } from "@/lib/db.js";
import { scoreEvents, hotBand } from "@/lib/leadScore.js";

export interface PrefectureKpi {
  prefecture: string;
  total: number;
  byStatus: Record<string, number>;
}

/** 都道府県 × ステータスの件数表。 */
export async function getPrefectureKpi(): Promise<PrefectureKpi[]> {
  const rows = await prisma.facility.groupBy({
    by: ["prefecture", "status"],
    _count: { _all: true },
  });

  const map = new Map<string, PrefectureKpi>();
  for (const r of rows) {
    const pref = r.prefecture ?? "（未設定）";
    const entry = map.get(pref) ?? { prefecture: pref, total: 0, byStatus: {} };
    const n = r._count._all;
    entry.byStatus[r.status] = (entry.byStatus[r.status] ?? 0) + n;
    entry.total += n;
    map.set(pref, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** ファネル全体の行動ログ件数（種別ごと）。 */
export async function getFunnelTotals(): Promise<Record<string, number>> {
  const rows = await prisma.leadEvent.groupBy({
    by: ["type"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.type] = r._count._all;
  return out;
}

export interface HotLead {
  facilityId: string;
  name: string;
  prefecture: string | null;
  status: string;
  score: number;
  band: "hot" | "warm" | "cold";
}

/** 本命スコアの高い事業所を上位から返す（開封のみは加点しない）。 */
export async function getHotLeads(limit = 20): Promise<HotLead[]> {
  // データ規模（数百件）では全件取得→JS集計で十分。
  const events = await prisma.leadEvent.findMany({
    select: { facilityId: true, type: true },
  });

  const typesByFacility = new Map<string, string[]>();
  for (const e of events) {
    const arr = typesByFacility.get(e.facilityId) ?? [];
    arr.push(e.type);
    typesByFacility.set(e.facilityId, arr);
  }

  const scored = [...typesByFacility.entries()]
    .map(([facilityId, types]) => ({ facilityId, score: scoreEvents(types) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return [];

  const facilities = await prisma.facility.findMany({
    where: { id: { in: scored.map((s) => s.facilityId) } },
    select: { id: true, name: true, prefecture: true, status: true },
  });
  const fmap = new Map(facilities.map((f) => [f.id, f]));

  return scored.map((s) => {
    const f = fmap.get(s.facilityId);
    return {
      facilityId: s.facilityId,
      name: f?.name ?? "(不明)",
      prefecture: f?.prefecture ?? null,
      status: f?.status ?? "-",
      score: s.score,
      band: hotBand(s.score),
    };
  });
}

export interface FailedPayment {
  id: string;
  facilityName: string;
  kind: string;
  amount: number;
  createdAt: Date;
}

/** 決済失敗の一覧（新しい順）。 */
export async function getFailedPayments(limit = 30): Promise<FailedPayment[]> {
  const rows = await prisma.payment.findMany({
    where: { state: "failed" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { facility: { select: { name: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    facilityName: p.facility.name,
    kind: p.kind,
    amount: p.amount,
    createdAt: p.createdAt,
  }));
}

export interface DashboardData {
  prefectureKpi: PrefectureKpi[];
  funnel: Record<string, number>;
  hotLeads: HotLead[];
  failedPayments: FailedPayment[];
  totalFacilities: number;
}

/** ダッシュボードに必要な集計をまとめて取得する。 */
export async function getDashboardData(): Promise<DashboardData> {
  const [prefectureKpi, funnel, hotLeads, failedPayments, totalFacilities] =
    await Promise.all([
      getPrefectureKpi(),
      getFunnelTotals(),
      getHotLeads(20),
      getFailedPayments(30),
      prisma.facility.count(),
    ]);
  return { prefectureKpi, funnel, hotLeads, failedPayments, totalFacilities };
}
