import { describe, test, expect } from "vitest";
import {
  normalizeUrlInput,
  isPrivateHost,
  isSafeFetchUrl,
  htmlToText,
} from "@/server/generate/fetchSiteText.js";

describe("normalizeUrlInput", () => {
  test("スキーム無しは https を補う", () => {
    expect(normalizeUrlInput("example.com")).toBe("https://example.com/");
    expect(normalizeUrlInput("  www.example.com/about  ")).toBe("https://www.example.com/about");
  });

  test("http/https はそのまま扱う", () => {
    expect(normalizeUrlInput("http://example.com")).toBe("http://example.com/");
  });

  test("URLとして壊れているもの・空は null", () => {
    expect(normalizeUrlInput("")).toBeNull();
    expect(normalizeUrlInput("なし")).toBeNull();
    expect(normalizeUrlInput("http://")).toBeNull();
  });

  test("http/https 以外のスキームは null", () => {
    expect(normalizeUrlInput("javascript:alert(1)")).toBeNull();
    expect(normalizeUrlInput("file:///etc/passwd")).toBeNull();
    expect(normalizeUrlInput("ftp://example.com")).toBeNull();
  });
});

describe("isPrivateHost", () => {
  test("ループバック・内部ホスト名を拒否する", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("::1")).toBe(true);
    expect(isPrivateHost("foo.local")).toBe(true);
  });

  test("プライベートIP帯を拒否する", () => {
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("172.31.255.255")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
    expect(isPrivateHost("0.0.0.0")).toBe(true);
  });

  test("クラウドのメタデータIPを拒否する", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
  });

  test("公開ホストは許可する", () => {
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false); // 172.16/12 の範囲外
  });
});

describe("isSafeFetchUrl", () => {
  test("公開されたhttps URLは安全", () => {
    expect(isSafeFetchUrl("https://example.com/about")).toBe(true);
  });

  test("内部宛て・非HTTPは安全でない", () => {
    expect(isSafeFetchUrl("http://localhost:3000/")).toBe(false);
    expect(isSafeFetchUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeFetchUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeFetchUrl("")).toBe(false);
  });
});

describe("htmlToText", () => {
  test("スクリプト・スタイルの中身を落とす", () => {
    // Arrange
    const html = `<html><head><style>body{color:red}</style></head>
      <body><script>alert('x')</script><p>作業内容は農作業です</p></body></html>`;

    // Act
    const text = htmlToText(html);

    // Assert
    expect(text).toContain("作業内容は農作業です");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  test("ブロック要素は改行として扱い、タグは除去する", () => {
    const text = htmlToText("<h1>ひまわり作業所</h1><p>送迎あり</p><p>昼食無料</p>");
    expect(text).toContain("ひまわり作業所");
    expect(text).toContain("送迎あり");
    expect(text).toContain("昼食無料");
    expect(text).not.toContain("<");
  });

  test("主要な実体参照を戻す", () => {
    expect(htmlToText("<p>A&amp;B&nbsp;C</p>")).toContain("A&B C");
  });

  test("空入力は空文字", () => {
    expect(htmlToText("")).toBe("");
  });
});
