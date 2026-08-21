// 共通テンプレートのアイコン集（不可侵）。構造化データは IconKey を参照するだけで、
// 実体のSVGはこのコードに閉じる。すべて currentColor・stroke ベースで配色に追従する。

import type { ReactElement } from "react";
import type { IconKey } from "@/lib/siteData.js";

/** テンプレ内部でUIにも使う追加アイコン（データ語彙には含めない）。 */
export type UiIconKey = "phone" | "pin" | "chat" | "arrow";

type AnyIcon = IconKey | UiIconKey;

/** 各アイコンの path 群（24x24・stroke=currentColor）。 */
const PATHS: Record<AnyIcon, ReactElement> = {
  box: (
    <>
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 8l12 8M8 16L20 8" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 20h20" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 11h16" />
      <circle cx="8" cy="19" r="1.5" />
      <circle cx="16" cy="19" r="1.5" />
    </>
  ),
  lunch: (
    <>
      <path d="M5 3v7a2 2 0 004 0V3M7 3v18" />
      <path d="M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-1 2.5-4-1-5-2.5-5zM17 12v9" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0112 0" />
      <path d="M16 6a3 3 0 010 6M21 20a6 6 0 00-4-5.6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2 3 2 3H6" />
    </>
  ),
  heart: (
    <path d="M12 20s-7-4.5-9.5-9C1 7.5 3 4.5 6.2 4.5c1.9 0 3.1 1.1 3.8 2.1.7-1 1.9-2.1 3.8-2.1C17 4.5 19 7.5 17.5 11 15 15.5 12 20 12 20z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20C4 11 11 4 20 4c0 9-7 16-16 16z" />
      <path d="M4 20c4-6 8-9 12-11" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  star: (
    <path d="M12 3l2.6 5.6L20.5 9.4l-4.3 4 1.1 6L12 16.8 6.7 19.4l1.1-6-4.3-4 5.9-.8L12 3z" />
  ),
  phone: (
    <path d="M6 3h3l1.5 5-2 1.5a12 12 0 006 6l1.5-2 5 1.5v3a2 2 0 01-2 2A17 17 0 014 5a2 2 0 012-2z" />
  ),
  pin: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  chat: (
    <path d="M4 5h16v11H9l-4 3v-3H4V5z" />
  ),
  arrow: <path d="M4 12h14M13 6l6 6-6 6" />,
};

interface IconProps {
  name: AnyIcon;
  size?: number;
  className?: string;
}

/** IconKey/UiIconKey を受け取り、装飾用の inline SVG を返す。 */
export function Icon({ name, size = 24, className }: IconProps): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
