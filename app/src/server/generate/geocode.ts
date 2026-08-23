// 住所→緯度経度（OpenStreetMap Nominatim・APIキー不要）。
// 日本の詳細住所（番地付き）は該当しないことが多いため、段階的に簡略化して再試行する。
// 生成時（手元バッチ）に1回だけ呼ぶ想定。Nominatim の利用規約に従い User-Agent を付与。

export interface Geo {
  lat: number;
  lng: number;
}

/** 住所から検索候補を「詳細→粗」の順で作る。 */
export function addressCandidates(address: string): string[] {
  const a = address.trim();
  const cands: string[] = [a];

  // 末尾の番地（数字・ハイフン・丁目/番地/号 等）を落とす。
  const noBanchi = a.replace(/[\s　]*[0-9０-９][0-9０-９\-ー－の丁目番地号\s　]*$/u, "").trim();
  if (noBanchi && noBanchi !== a) cands.push(noBanchi);

  // 都道府県＋市区町村（郡含む）まで。
  const m = a.match(/^(.+?[都道府県])(.+?[市区町村])/u);
  if (m) {
    const pc = `${m[1]}${m[2]}`;
    if (!cands.includes(pc)) cands.push(pc);
  }
  return cands;
}

/** Nominatim で1件ジオコーディングする。 */
async function nominatim(query: string): Promise<Geo | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
      countrycodes: "jp",
    }).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": "kizuna-hp/1.0 (fukushi-partner.com)" },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const r = arr[0];
  if (!r?.lat || !r?.lon) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** 住所をジオコーディングする。候補を順に試し、最初に当たったものを返す。 */
export async function geocodeAddress(address: string | null | undefined): Promise<Geo | null> {
  if (!address || !address.trim()) return null;
  const cands = addressCandidates(address);
  for (let i = 0; i < cands.length; i += 1) {
    try {
      const geo = await nominatim(cands[i]);
      if (geo) return geo;
    } catch {
      // 次の候補へ
    }
    // 連続アクセスを避ける（Nominatim 規約: 最大1req/s）。
    if (i < cands.length - 1) await new Promise((r) => setTimeout(r, 1100));
  }
  return null;
}
