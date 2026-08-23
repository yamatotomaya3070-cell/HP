// 共通テンプレート（不可侵）。SiteData を受け取り描画するだけの純表示コンポーネント。
// 事業所ごとの差分は props の data に閉じ、このコードは事業所間で共有・不変。

import type { ReactElement } from "react";
import {
  SECTIONS,
  type FactField,
  type IconKey,
  type ListItem,
  type Section,
  type SiteData,
  isPresentable,
} from "@/lib/siteData.js";
import { Icon } from "./Icon.js";

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

/** 電話番号を tel: リンク用に整形する。 */
function telHref(value: string): string {
  return `tel:${value.replace(/[^0-9+]/g, "")}`;
}

/** 保存済みの section 順を尊重しつつ、未登録の正規セクションを本来の位置へ補完する。
 *  既存データ（新セクション未登録）でも一日の流れ/アクセスが描画されるようにする。 */
function orderedSections(data: SiteData): Section[] {
  const hidden = new Set<Section>(data.layout.hidden);
  // 保存順（重複除去）。
  const saved = data.layout.sectionOrder.filter(
    (s, i, arr) => arr.indexOf(s) === i,
  );
  const savedSet = new Set<Section>(saved);
  const result: Section[] = [];
  let si = 0;
  for (const canonical of SECTIONS) {
    // 保存順に存在する canonical は、その相対位置で流し込む。
    while (si < saved.length && saved[si] === canonical) {
      result.push(saved[si]);
      si += 1;
    }
    // 保存順に無い正規セクションは、本来の位置に補完する。
    if (!savedSet.has(canonical)) result.push(canonical);
  }
  // 保存順の取りこぼし（順序が正規と食い違う場合）を末尾へ。
  for (; si < saved.length; si += 1) {
    if (!result.includes(saved[si])) result.push(saved[si]);
  }
  return result.filter((s) => !hidden.has(s));
}

/** 未確認セクションの共通「準備中」表示。断定を避ける。 */
function PrepNote({ label }: { label: string }): ReactElement {
  return (
    <p className="prep-note">
      <span className="prep-badge">準備中</span>
      {label}は現在準備中です。最新の情報は事業所へ直接お問い合わせください。
    </p>
  );
}

/** アイコン付きの特徴カード（サービス/作業内容）。 */
function FeatureCard({ item, index, id }: { item: ListItem; index: number; id: Section }): ReactElement {
  return (
    <article className="feature-card" key={`${id}-${index}`}>
      {item.image ? (
        <div className="feature-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="" loading="lazy" />
        </div>
      ) : null}
      <div className="feature-body">
        <div className="feature-head">
          {item.icon ? (
            <span className="feature-icon" aria-hidden="true">
              <Icon name={item.icon} size={22} />
            </span>
          ) : null}
          <h3>{item.title}</h3>
        </div>
        {item.description ? <p>{item.description}</p> : null}
      </div>
    </article>
  );
}

function ListSection({
  id,
  heading,
  state,
  items,
}: {
  id: Section;
  heading: string;
  state: "confirmed" | "unconfirmed";
  items: ListItem[];
}): ReactElement {
  return (
    <section className="section" id={id} aria-labelledby={`${id}-h`}>
      <div className="wrap">
        <h2 className="section-title" id={`${id}-h`}>
          {heading}
        </h2>
        {state === "confirmed" && items.length > 0 ? (
          <div className="card-grid">
            {items.map((item, i) => (
              <FeatureCard item={item} index={i} id={id} key={`${id}-${i}`} />
            ))}
          </div>
        ) : (
          <PrepNote label={heading} />
        )}
      </div>
    </section>
  );
}

function DetailRow({
  fieldKey,
  field,
}: {
  fieldKey: string;
  field: FactField;
}): ReactElement | null {
  const label = DETAIL_LABELS[fieldKey] ?? fieldKey;
  if (!isPresentable(field)) return null;
  const value = field.value as string;

  let dd: ReactElement;
  if (fieldKey === "url") {
    dd = (
      <dd>
        <a href={value} target="_blank" rel="noopener noreferrer">
          {value}
        </a>
      </dd>
    );
  } else if (fieldKey === "tel") {
    dd = (
      <dd>
        <a href={telHref(value)}>{value}</a>
      </dd>
    );
  } else if (fieldKey === "email") {
    dd = (
      <dd>
        <a href={`mailto:${value}`}>{value}</a>
      </dd>
    );
  } else {
    dd = <dd>{value}</dd>;
  }

  return (
    <div>
      <dt>{label}</dt>
      {dd}
    </div>
  );
}

/** ヒーロー：左＝コピー＋CTA＋バッジ、右＝メインビジュアル（あれば）。 */
function HeroSection(data: SiteData): ReactElement {
  const tel = data.details.tel;
  const hasImage = data.hero.image.length > 0;
  return (
    <section
      className={`hero${hasImage ? " has-image" : ""}`}
      id="hero"
      aria-labelledby="hero-h"
      key="hero"
    >
      <div className="wrap hero-grid">
        <div className="hero-copy">
          {data.hero.subheadline ? (
            <p className="sub">{data.hero.subheadline}</p>
          ) : null}
          <h1 id="hero-h">{data.hero.headline}</h1>
          {data.hero.catchCopy ? (
            <p className="catch">{data.hero.catchCopy}</p>
          ) : null}
          <div className="hero-actions">
            <a className="hero-cta" href="#contact">
              <Icon name="calendar" size={20} />
              見学・ご相談はこちら
            </a>
            {isPresentable(tel) ? (
              <a className="hero-tel" href={telHref(tel.value as string)}>
                <Icon name="phone" size={18} />
                お電話 {tel.value}
              </a>
            ) : null}
          </div>
          {data.hero.highlights.length > 0 ? (
            <ul className="hero-badges">
              {data.hero.highlights.map((h, i) => (
                <li key={`hl-${i}`}>
                  <Icon name={h.icon} size={18} />
                  {h.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {hasImage ? (
          <div className="hero-visual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.hero.image}
              alt={data.hero.imageAlt}
              fetchPriority="high"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 一日の流れ：時刻＋アイコン＋見出し＋説明のタイムライン。 */
function DailyFlowSection(data: SiteData): ReactElement {
  const { heading, state, steps } = data.dailyFlow;
  return (
    <section className="section flow" id="dailyFlow" aria-labelledby="dailyFlow-h" key="dailyFlow">
      <div className="wrap">
        <p className="eyebrow">FLOW</p>
        <h2 className="section-title" id="dailyFlow-h">
          {heading}
        </h2>
        {state === "confirmed" && steps.length > 0 ? (
          <ol className="flow-list">
            {steps.map((step, i) => (
              <li className="flow-step" key={`flow-${i}`}>
                <span className="flow-icon" aria-hidden="true">
                  <Icon name={(step.icon ?? "clock") as IconKey} size={22} />
                </span>
                {step.time ? <span className="flow-time">{step.time}</span> : null}
                <h3 className="flow-title">{step.title}</h3>
                {step.description ? (
                  <p className="flow-desc">{step.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <PrepNote label={heading} />
        )}
      </div>
    </section>
  );
}

/** アクセス：geo があれば OpenStreetMap を埋め込む。無ければ「地図で開く」リンク。 */
function AccessSection(data: SiteData): ReactElement | null {
  const address = data.details.address;
  const query =
    data.access.mapQuery.trim() ||
    (isPresentable(address) ? (address.value as string) : "");
  const geo = data.access.geo;

  // Google埋込は X-Frame-Options で不可のため、埋め込みは OSM、リンクは Google を使う。
  const osmSrc = geo
    ? (() => {
        const d = 0.006;
        const bbox = `${geo.lng - d},${geo.lat - d},${geo.lng + d},${geo.lat + d}`;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${geo.lat},${geo.lng}`;
      })()
    : "";
  const mapLink = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";

  if (!query && !geo) {
    return (
      <section className="section access" id="access" aria-labelledby="access-h" key="access">
        <div className="wrap">
          <p className="eyebrow">ACCESS</p>
          <h2 className="section-title" id="access-h">
            {data.access.heading}
          </h2>
          <PrepNote label={data.access.heading} />
        </div>
      </section>
    );
  }

  return (
    <section className="section access" id="access" aria-labelledby="access-h" key="access">
      <div className="wrap">
        <p className="eyebrow">ACCESS</p>
        <h2 className="section-title" id="access-h">
          {data.access.heading}
        </h2>
        <div className="access-grid">
          <div className="map-frame">
            {osmSrc ? (
              <iframe
                title={`${data.hero.headline}の地図`}
                src={osmSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="map-placeholder" aria-hidden="true">
                <Icon name="pin" size={40} />
              </div>
            )}
          </div>
          <div className="access-info">
            {isPresentable(address) ? (
              <p className="access-address">
                <Icon name="pin" size={20} />
                {address.value}
              </p>
            ) : null}
            {data.access.note ? <p>{data.access.note}</p> : null}
            {mapLink ? (
              <a
                className="btn"
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="pin" size={18} />
                地図で開く
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function renderSection(section: Section, data: SiteData): ReactElement | null {
  switch (section) {
    case "hero":
      return HeroSection(data);

    case "about":
      return (
        <section
          className="section"
          id="about"
          aria-labelledby="about-h"
          key="about"
        >
          <div className="wrap">
            <p className="eyebrow">ABOUT</p>
            <h2 className="section-title" id="about-h">
              {data.about.heading}
            </h2>
            <div className="about-body">
              {data.about.body.map((p, i) => (
                <p key={`about-${i}`}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      );

    case "services":
      return (
        <ListSection
          id="services"
          heading={data.services.heading}
          state={data.services.state}
          items={data.services.items}
          key="services"
        />
      );

    case "workContent":
      return (
        <ListSection
          id="workContent"
          heading={data.workContent.heading}
          state={data.workContent.state}
          items={data.workContent.items}
          key="workContent"
        />
      );

    case "dailyFlow":
      return DailyFlowSection(data);

    case "access":
      return AccessSection(data);

    case "details": {
      const d = data.details;
      const order: (keyof typeof d)[] = [
        "corpName",
        "address",
        "tel",
        "fax",
        "url",
        "email",
        "businessHours",
        "holidays",
        "accessTransport",
        "lunch",
        "wage",
      ];
      const rows = order
        .map((k) => {
          const field = d[k];
          if (typeof field === "string") return null; // heading は除外
          return (
            <DetailRow key={`d-${k}`} fieldKey={k as string} field={field} />
          );
        })
        .filter(Boolean);
      return (
        <section
          className="section"
          id="details"
          aria-labelledby="details-h"
          key="details"
        >
          <div className="wrap">
            <p className="eyebrow">INFORMATION</p>
            <h2 className="section-title" id="details-h">
              {d.heading}
            </h2>
            <div className="detail-card">
              <dl className="detail-list">{rows}</dl>
            </div>
          </div>
        </section>
      );
    }

    case "gallery":
      if (data.gallery.photos.length === 0) return null; // 写真なしは非表示
      return (
        <section
          className="section"
          id="gallery"
          aria-labelledby="gallery-h"
          key="gallery"
        >
          <div className="wrap">
            <p className="eyebrow">GALLERY</p>
            <h2 className="section-title" id="gallery-h">
              {data.gallery.heading}
            </h2>
            <div className="gallery-grid">
              {data.gallery.photos.map((photo, i) => (
                <figure key={`g-${i}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.alt} loading="lazy" />
                  {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      );

    case "contact": {
      const tel = data.details.tel;
      const email = data.details.email;
      const hasCta = data.contact.ctaTitle.length > 0;
      return (
        <section
          className="section contact"
          id="contact"
          aria-labelledby="contact-h"
          key="contact"
        >
          <div className="wrap">
            <p className="eyebrow">CONTACT</p>
            <h2 className="section-title" id="contact-h">
              {data.contact.heading}
            </h2>
            <div className={`contact-grid${hasCta ? " with-cta" : ""}`}>
              <div className="detail-card">
                {data.contact.note ? <p>{data.contact.note}</p> : null}
                <div className="contact-actions">
                  {isPresentable(tel) ? (
                    <a
                      className="btn primary"
                      href={telHref(tel.value as string)}
                    >
                      <Icon name="phone" size={18} />
                      電話でお問い合わせ
                    </a>
                  ) : null}
                  {isPresentable(email) ? (
                    <a className="btn" href={`mailto:${email.value}`}>
                      <Icon name="chat" size={18} />
                      メールでお問い合わせ
                    </a>
                  ) : null}
                </div>
              </div>
              {hasCta ? (
                <aside className="cta-card">
                  <span className="cta-icon" aria-hidden="true">
                    <Icon name="heart" size={28} />
                  </span>
                  <h3>{data.contact.ctaTitle}</h3>
                  {data.contact.ctaBody ? <p>{data.contact.ctaBody}</p> : null}
                  <a className="btn primary" href="#contact">
                    {data.contact.ctaLabel || "お問い合わせ"}
                    <Icon name="arrow" size={18} />
                  </a>
                </aside>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}

export function SiteTemplate({ data }: { data: SiteData }): ReactElement {
  const sections = orderedSections(data);
  const brandName = data.hero.headline;

  return (
    <div className="site" data-theme={data.theme.preset}>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href="#hero">
            {brandName}
            <small>就労継続支援B型</small>
          </a>
          <nav className="nav" aria-label="メインナビゲーション">
            <a href="#about">私たちについて</a>
            <a href="#services">サービス</a>
            <a href="#dailyFlow">一日の流れ</a>
            <a href="#details">事業所情報</a>
            <a href="#access">アクセス</a>
          </nav>
          <a className="header-cta" href="#contact">
            <Icon name="calendar" size={18} />
            見学・ご相談
          </a>
        </div>
      </header>

      <main>{sections.map((section) => renderSection(section, data))}</main>

      <footer className="site-footer">
        <div className="wrap">
          <span>{brandName}</span>
          <span>
            {isPresentable(data.details.corpName)
              ? data.details.corpName.value
              : null}
          </span>
        </div>
      </footer>
    </div>
  );
}
