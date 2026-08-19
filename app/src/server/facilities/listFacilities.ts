// 事業所一覧・集計（Phase 1 の最小管理機能。Phase 7 の管理画面が利用する）。
import { prisma } from "@/lib/db.js";
import type { FacilityStatus } from "@prisma/client";

export interface FacilityListParams {
  prefecture?: string;
  status?: FacilityStatus;
  hasEmail?: boolean;
  skip?: number;
  take?: number;
}

/** 条件で事業所を一覧取得。 */
export async function listFacilities(params: FacilityListParams = {}) {
  const where: Record<string, unknown> = {};
  if (params.prefecture) where.prefecture = params.prefecture;
  if (params.status) where.status = params.status;
  if (params.hasEmail === true) where.email = { not: null };
  if (params.hasEmail === false) where.email = null;

  const [items, total] = await Promise.all([
    prisma.facility.findMany({
      where,
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.facility.count({ where }),
  ]);
  return { items, total };
}

/** 都道府県別の件数集計（総数・メール有）。 */
export async function countByPrefecture() {
  const rows = await prisma.facility.groupBy({
    by: ["prefecture"],
    _count: { _all: true },
  });
  const withEmail = await prisma.facility.groupBy({
    by: ["prefecture"],
    where: { email: { not: null } },
    _count: { _all: true },
  });
  const emailMap = new Map(withEmail.map((r) => [r.prefecture, r._count._all]));
  return rows
    .map((r) => ({
      prefecture: r.prefecture,
      total: r._count._all,
      withEmail: emailMap.get(r.prefecture) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** ステータス別の件数集計。 */
export async function countByStatus() {
  const rows = await prisma.facility.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return rows.map((r) => ({ status: r.status, count: r._count._all }));
}
