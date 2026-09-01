// LINEで入力された事業所名を、収集済みリスト（WAM NET由来のFacility）と照合する。
//
// なぜ必要か: 照合せず新規作成すると、収集データの高精度な事実（法人名/住所/TEL/FAX/都道府県）を
// 捨ててしまい、①Web検索リサーチが名称だけになって別事業所を拾う ②事業所情報欄と地図が空
// ③同一事業所がDBに重複、という劣化が起きる。名称で候補を出し、本人に確認して紐付ける。
//
// 純粋関数（キー生成・スコア・並べ替え）とDB問い合わせを分離し、前者をテスト対象にする。

import { prisma } from "@/lib/db.js";
import { normalizeText } from "@/server/import/normalize.js";

/** 比較時に落とす法人格の語。 */
const CORP_WORDS = [
  "特定非営利活動法人",
  "社会福祉法人",
  "社会医療法人",
  "一般社団法人",
  "一般財団法人",
  "公益社団法人",
  "公益財団法人",
  "医療法人社団",
  "医療法人",
  "株式会社",
  "有限会社",
  "合同会社",
  "合資会社",
  "合名会社",
  "NPO法人",
  "npo法人",
];

/** 名称の比較用キー: NFKC・空白除去・小文字化・法人格除去・記号除去。 */
export function facilityNameKey(name: string | null | undefined): string {
  let s = normalizeText(name);
  for (const w of CORP_WORDS) {
    s = s.split(normalizeText(w)).join("");
  }
  return s.replace(/[・･,，.。()（）「」『』\-ー―‐/／|｜:：]/g, "");
}

/** 表示上の見た目を保ったまま法人格だけを落とす（SQL検索語の生成用）。 */
export function stripCorpPrefix(name: string): string {
  let s = name.normalize("NFKC").trim();
  for (const w of CORP_WORDS) {
    s = s.split(w).join("");
  }
  return s.trim();
}

/** DB検索に使う候補語を、再現率が高い順に重複なく組み立てる。 */
export function searchTerms(name: string): string[] {
  const core = (name ?? "").normalize("NFKC").trim();
  if (facilityNameKey(core).length < 2) return [];

  const stripped = stripCorpPrefix(core);
  const despaced = stripped.replace(/\s+/g, "");
  const head = despaced.slice(0, 4);

  return [core, stripped, despaced, head]
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

/** 照合対象の最小情報。 */
export interface FacilityCandidate {
  id: string;
  name: string;
  corpName: string | null;
  address: string | null;
  prefecture: string | null;
  url: string | null;
}

/** 入力名と候補の近さ（大きいほど近い。0は不一致）。 */
export function candidateScore(
  input: string,
  cand: { name: string; corpName?: string | null },
): number {
  const a = facilityNameKey(input);
  const b = facilityNameKey(cand.name);
  if (!a || !b) return 0;

  if (a === b) return 100;
  if (b.startsWith(a) || a.startsWith(b)) return 80;
  if (b.includes(a) || a.includes(b)) return 60;

  const c = facilityNameKey(cand.corpName);
  if (c && (c === a || c.includes(a) || a.includes(c))) return 40;
  return 0;
}

/** 候補をスコア順に並べ、不一致（0点）を除外する。 */
export function rankCandidates<T extends { name: string; corpName?: string | null }>(
  input: string,
  rows: readonly T[],
): T[] {
  return rows
    .map((row) => ({ row, score: candidateScore(input, row) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.row);
}

/**
 * 「LINEのチャットで名乗るだけで紐付けてよい」事業所の条件。
 *
 * セキュリティ上の核心: LINEの本人確認は「はい」と答えるだけ＝自己申告でしかない。
 * 一方 generateRichSiteForFacility は currentVersion を差し替え、runEdit は本文を書き換える。
 * よって、既に持ち主が確定している事業所（契約あり／公開済み／他LINEユーザーが紐付け済み）は
 * 自己申告での紐付け対象から必ず除外する。該当した場合は運営の確認に回す。
 *
 * メール経由の編集ループは署名付きReply-Toトークンで本人性を担保している（handleInbound）。
 * LINEには等価な仕組みが無いため、ここでの除外が唯一の防御線になる。
 */
const UNCLAIMED: object = {
  // 他のLINEユーザーが既に紐付けている＝持ち主が居る。
  lineUsers: { none: {} },
  // 契約（トライアル含む）がある＝顧客。
  subscription: { is: null },
  // 公開済み/解約後静的公開のサイトを持つ＝実運用中。
  sites: { none: { publishState: { in: ["published", "static"] } } },
};

/**
 * 紐付けてよい事業所の条件を組み立てる。
 *
 * 重要: 「既にその事業所を持っている本人」は除外してはいけない。
 * 持ち主が「やり直し」で再度ヒアリングした場合まで締め出してしまい、
 * 自分の事業所に入れなくなる（実際にそうなった）。
 * ガードの目的はあくまで第三者を止めることなので、本人は素通しする。
 */
export function buildSelfBindableWhere(lineUserId?: string): object {
  if (!lineUserId) return UNCLAIMED;
  return {
    OR: [
      // 本人が既に紐付けている＝自分の事業所。契約・公開の有無に関わらず許可。
      { lineUsers: { some: { lineUserId } } },
      UNCLAIMED,
    ],
  };
}

/** 名称照合の結果。 */
export interface FacilityMatchResult {
  /** 自己申告で紐付けてよい候補。 */
  candidates: FacilityCandidate[];
  /** 名称は一致したが、持ち主が確定していて自動紐付けできない件数。 */
  protectedCount: number;
}

/**
 * 収集済みリストから名称で候補を探す。
 * LINE経由で作った事業所（facilityNumber が line-*）は照合対象から除外する。
 */
export async function findFacilityCandidates(
  name: string,
  lineUserId?: string,
  limit = 4,
): Promise<FacilityMatchResult> {
  const terms = searchTerms(name);
  if (terms.length === 0) return { candidates: [], protectedCount: 0 };

  const bindable = buildSelfBindableWhere(lineUserId);
  const nameMatch = {
    AND: [
      { OR: terms.map((t) => ({ name: { contains: t } })) },
      { NOT: { facilityNumber: { startsWith: "line-" } } },
    ],
  };

  const rows = await prisma.facility.findMany({
    where: { AND: [nameMatch, bindable] },
    select: {
      id: true,
      name: true,
      corpName: true,
      address: true,
      prefecture: true,
      url: true,
    },
    take: 30,
  });
  const candidates = rankCandidates(name, rows).slice(0, limit);

  // 紐付け不可の一致が別にあるかを調べ、あれば運営確認へ回す材料にする。
  const protectedRows = await prisma.facility.findMany({
    where: { AND: [nameMatch, { NOT: bindable }] },
    select: { id: true, name: true, corpName: true },
    take: 30,
  });

  return {
    candidates,
    protectedCount: rankCandidates(name, protectedRows).length,
  };
}

/**
 * 紐付け直前の再確認（多層防御）。
 * 候補提示から確定までの間に持ち主が確定した場合や、古いドラフトが残っていた場合に、
 * 保護対象の事業所へ書き込んでしまうのを防ぐ。
 */
export async function isSelfBindable(
  facilityId: string,
  lineUserId?: string,
): Promise<boolean> {
  const found = await prisma.facility.findFirst({
    where: { AND: [{ id: facilityId }, buildSelfBindableWhere(lineUserId)] },
    select: { id: true },
  });
  return found !== null;
}
