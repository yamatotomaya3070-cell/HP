"use client";

// 公開前確認（クライアント）。掲載内容のレビュー＋チェックリスト。全項目チェックで確定できる。
// 確定→/api/publish/confirm。実際の公開（5,000円決済）は次段（Stripe接続後に有効化）。

import { useMemo, useState } from "react";
import { PRE_PUBLISH_ITEMS, type PrePublishKey, type ReviewRow } from "@/lib/prePublish.js";
import styles from "./publish.module.css";

type Props = {
  token: string;
  facilityName: string;
  slug: string;
  review: ReviewRow[];
  alreadyPublished: boolean;
};

type Checked = Record<PrePublishKey, boolean>;

const initialChecked = (): Checked =>
  Object.fromEntries(PRE_PUBLISH_ITEMS.map((i) => [i.key, false])) as Checked;

export function PublishConfirmClient({
  token,
  facilityName,
  slug,
  review,
  alreadyPublished,
}: Props) {
  const [checked, setChecked] = useState<Checked>(initialChecked);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = useMemo(
    () => PRE_PUBLISH_ITEMS.every((i) => checked[i.key]),
    [checked],
  );

  const toggle = (key: PrePublishKey) =>
    setChecked((c) => ({ ...c, [key]: !c[key] }));

  const submit = async () => {
    if (!allChecked || pending) return;
    setPending(true);
    setError(null);
    try {
      const confirm = Object.fromEntries(
        PRE_PUBLISH_ITEMS.map((i) => [i.key, true]),
      );
      const res = await fetch("/api/publish/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "確認の送信に失敗しました。");
        return;
      }
      setDone(true);
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setPending(false);
    }
  };

  if (alreadyPublished) {
    return (
      <main className={styles.shell}>
        <h1 className={styles.title}>{facilityName} のホームページ</h1>
        <p className={styles.lead}>
          このホームページはすでに公開済みです。内容の変更は編集リンクから行えます。
        </p>
        <a className={styles.previewLink} href={`/preview/${slug}`} target="_blank" rel="noreferrer">
          現在のホームページを見る
        </a>
      </main>
    );
  }

  if (done) {
    return (
      <main className={styles.shell}>
        <h1 className={styles.title}>ご確認ありがとうございました</h1>
        <p className={styles.lead}>
          公開前の確認を受け付けました。続いて、正式公開（初回 5,000円）のお手続きへ進みます。
        </p>
        <p className={styles.note}>
          ※ お支払い手続きは現在準備中です。担当より公開手続きのご案内をお送りします。
        </p>
        <a className={styles.previewLink} href={`/preview/${slug}`} target="_blank" rel="noreferrer">
          確認したホームページをもう一度見る
        </a>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>{facilityName} のホームページ 公開前の確認</h1>
      <p className={styles.lead}>
        公開すると、以下の内容がインターネット上に表示されます。内容をご確認のうえ、
        すべての項目にチェックして「内容を確定する」を押してください。
      </p>

      <a className={styles.previewLink} href={`/preview/${slug}`} target="_blank" rel="noreferrer">
        実際のホームページ（プレビュー）を開く
      </a>

      <section aria-labelledby="review-heading" className={styles.reviewCard}>
        <h2 id="review-heading" className={styles.sectionTitle}>掲載される内容</h2>
        <dl className={styles.reviewList}>
          {review.map((row) => (
            <div key={row.label} className={styles.reviewRow}>
              <dt className={styles.reviewLabel}>{row.label}</dt>
              <dd className={`${styles.reviewValue} ${row.missing ? styles.missing : ""}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="check-heading" className={styles.checklist}>
        <h2 id="check-heading" className={styles.sectionTitle}>確認事項</h2>
        {PRE_PUBLISH_ITEMS.map((item) => (
          <label key={item.key} className={styles.checkItem}>
            <input
              type="checkbox"
              checked={checked[item.key]}
              onChange={() => toggle(item.key)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </section>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <button
        type="button"
        className={styles.confirmBtn}
        onClick={submit}
        disabled={!allChecked || pending}
      >
        {pending ? "送信しています…" : "内容を確定する"}
      </button>
      {!allChecked ? (
        <p className={styles.note}>すべての項目にチェックすると確定できます。</p>
      ) : null}
    </main>
  );
}
