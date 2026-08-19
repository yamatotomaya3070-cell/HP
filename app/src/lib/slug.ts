// 推測不可能な公開/プレビュー slug（仕様9. セキュリティ: 推測不可能なURL）。
// 連番やID由来にせず、暗号乱数から生成する。

import { randomBytes } from "node:crypto";

// 紛らわしい文字（0/o/1/l 等）を除いた Crockford 風アルファベット。
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 既定22文字（約110bit）の推測不可能な slug を返す。 */
export function generateSlug(length = 22): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
