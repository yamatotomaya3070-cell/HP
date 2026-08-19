import { describe, test, expect } from "vitest";
import { dedupeBatch, identityKeys } from "@/server/import/dedup.js";
import { normalizeRecord } from "@/server/import/normalize.js";

const rec = (o: Parameters<typeof normalizeRecord>[0], pref: string | null = null) =>
  normalizeRecord(o, pref);

describe("dedupeBatch", () => {
  test("同一事業所番号は1件に統合される（二重登録防止）", () => {
    const { unique, duplicatesRemoved } = dedupeBatch([
      rec({ facilityNumber: "2910103973", name: "A事業所", email: "a@x.jp", status: "ok" }),
      rec({ facilityNumber: "2910103973", name: "A事業所", tel: "0742-1", status: "no_email_listed" }),
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicatesRemoved).toBe(1);
    // 欠損補完＆メール成功優先
    expect(unique[0].email).toBe("a@x.jp");
    expect(unique[0].tel).toBe("0742-1");
  });

  test("事業所番号が無くても複合キー一致で統合される", () => {
    const base = { corpName: "株式会社X", name: "Y事業所", tel: "0742-2-3", address: "奈良県奈良市1-1" };
    const { unique } = dedupeBatch([
      rec(base),
      rec({ ...base, tel: "０７４２ー２ー３" }), // 全角違いのみ
    ]);
    expect(unique).toHaveLength(1);
  });

  test("メール一致でも統合される", () => {
    const { unique } = dedupeBatch([
      rec({ name: "A", email: "same@x.jp", status: "ok" }),
      rec({ name: "B", email: "same@x.jp", status: "ok" }),
    ]);
    expect(unique).toHaveLength(1);
  });

  test("別事業所は別レコードのまま", () => {
    const { unique } = dedupeBatch([
      rec({ facilityNumber: "111", name: "A", tel: "1", address: "奈良県a" }),
      rec({ facilityNumber: "222", name: "B", tel: "2", address: "大阪府b" }),
    ]);
    expect(unique).toHaveLength(2);
  });

  test("全項目空のレコードはキーが立たず統合されない", () => {
    const empty = rec({ name: "名前だけ" });
    expect(identityKeys(empty).some((k) => k.startsWith("fn:") || k.startsWith("em:"))).toBe(false);
  });
});
