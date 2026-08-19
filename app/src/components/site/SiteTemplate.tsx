// 共通テンプレート（不可侵）。SiteData を受け取り描画するだけの純表示コンポーネント。
// 事業所ごとの差分は props の data に閉じ、このコードは事業所間で共有・不変。

import type { ReactElement } from "react";
import {
  type FactField,
  type ListItem,
  type Section,
  type SiteData,
  isPresentable,
} from "@/lib/siteData.js";

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

/** 未確認セクションの共通「準備中」表示。断定を避ける。 */
function PrepNote({ label }: { label: string }): ReactElement {
  return (
    <p className="prep-note">
      <span className="prep-badge">準備中</span>
      {label}は現在準備中です。最新の情報は事業所へ直接お問い合わせください。
    </p>
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
              <article className="feature-card" key={`${id}-${i}`}>
                <h3>{item.title}</h3>
                {item.description ? <p>{item.description}</p> : null}
              </article>
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
        <a href={`tel:${value.replace(/[^0-9+]/g, "")}`}>{value}</a>
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

function renderSection(section: Section, data: SiteData): ReactElement | null {
  switch (section) {
    case "hero":
      return (
        <section className="hero" id="hero" aria-labelledby="hero-h" key="hero">
          <div className="wrap">
            {data.hero.subheadline ? (
              <p className="sub">{data.hero.subheadline}</p>
            ) : null}
            <h1 id="hero-h">{data.hero.headline}</h1>
            {data.hero.catchCopy ? (
              <p className="catch">{data.hero.catchCopy}</p>
            ) : null}
            <a className="hero-cta" href="#contact">
              お問い合わせはこちら
            </a>
          </div>
        </section>
      );

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
                  <img src={photo.url} alt={photo.alt} />
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
            <div className="detail-card">
              {data.contact.note ? <p>{data.contact.note}</p> : null}
              <div className="contact-actions">
                {isPresentable(tel) ? (
                  <a
                    className="btn primary"
                    href={`tel:${(tel.value as string).replace(/[^0-9+]/g, "")}`}
                  >
                    電話でお問い合わせ
                  </a>
                ) : null}
                {isPresentable(email) ? (
                  <a className="btn" href={`mailto:${email.value}`}>
                    メールでお問い合わせ
                  </a>
                ) : null}
              </div>
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
  const hidden = new Set<Section>(data.layout.hidden);
  const sections = data.layout.sectionOrder.filter((s) => !hidden.has(s));
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
            <a href="#details">事業所情報</a>
            <a href="#contact">お問い合わせ</a>
          </nav>
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
