import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCsvLine, readWamCsv, loadSources } from "@/server/import/readSources.js";

describe("parseCsvLine", () => {
  test("クォート内のカンマとエスケープを処理する", () => {
    expect(parseCsvLine('a,b,c')).toEqual(["a", "b", "c"]);
    expect(parseCsvLine('"a,1","b","c"')).toEqual(["a,1", "b", "c"]);
    expect(parseCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', "x"]);
  });
});

describe("readWamCsv / loadSources", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "wam-test-"));
    const header = "事業所番号,事業所の名称,法人の名称,事業所住所（市区町村）,事業所住所（番地以降）,事業所電話番号,事業所FAX番号,事業所URL";
    const row = "111,テスト事業所,株式会社テスト,奈良県奈良市,1-2-3,0742-0-0,0742-0-1,https://ex.jp";
    writeFileSync(join(dir, "sample.csv"), `${header}\n${row}\n`, "utf8");
    // 事業所リスト
    writeFileSync(
      join(dir, "県_emails.json"),
      JSON.stringify([{ facilityNumber: "222", name: "JSON事業所", status: "ok", email: "a@b.jp" }]),
      "utf8",
    );
    // 事業所リストではないメタJSON（読み飛ばし対象）
    writeFileSync(join(dir, "all_progress.json"), JSON.stringify({ 奈良県: { total: 1 } }), "utf8");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("CSVの列をマッピングし住所を連結する", () => {
    const recs = readWamCsv(join(dir, "sample.csv"));
    expect(recs).toHaveLength(1);
    expect(recs[0].name).toBe("テスト事業所");
    expect(recs[0].address).toBe("奈良県奈良市1-2-3");
    expect(recs[0].tel).toBe("0742-0-0");
  });

  test("ディレクトリ取込でメタJSONを読み飛ばす", () => {
    const { sources, skipped } = loadSources(dir);
    // csv と emails.json の2ファイルが対象、all_progress.json は skipped
    expect(sources).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].path).toContain("all_progress.json");
  });
});
