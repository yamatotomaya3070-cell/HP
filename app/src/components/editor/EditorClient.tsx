"use client";

// 左AIチャット / 右ライブプレビューの編集画面（クライアント）。
// 送信→/api/edit→成功でプレビュー再読込。履歴パネルから復元も可能。

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./editor.module.css";

interface Props {
  token: string;
  slug: string;
  facilityName: string;
}

type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "error"; text: string };

interface VersionSummary {
  id: string;
  origin: string;
  note: string | null;
  createdAt: string;
  isCurrent: boolean;
}

const SUGGESTIONS = [
  "営業時間は平日9時〜16時です",
  "送迎あり（無料・要予約）と載せてください",
  "工賃は月平均15,000円です",
  "サービスに「軽作業」「農作業」を追加",
];

const ORIGIN_LABEL: Record<string, string> = {
  import: "初期生成",
  ai_email: "メールで編集",
  ai_editor: "画面で編集",
  manual: "手動",
  restore: "復元",
};

export function EditorClient({ token, slug, facilityName }: Props) {
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  const previewUrl = `/preview/${slug}?v=${previewKey}`;

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollToBottom, [chat, scrollToBottom]);

  const refreshPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/edit/history?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions ?? []);
    }
  }, [token]);

  const send = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (!instruction || pending) return;
      setChat((c) => [...c, { role: "user", text: instruction }]);
      setInput("");
      setPending(true);
      try {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, instruction }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg =
            data.kind === "not_configured"
              ? "AI編集は現在利用できません（管理者にAPIキーの設定をご確認ください）。"
              : (data.error ?? "編集に失敗しました。");
          setChat((c) => [...c, { role: "error", text: msg }]);
          return;
        }
        const summary =
          data.applied && data.appliedCount > 0
            ? `${data.message}\n（${data.appliedCount}件を反映しました）`
            : data.message;
        setChat((c) => [...c, { role: "assistant", text: summary }]);
        if (data.applied) {
          refreshPreview();
          if (showHistory) loadHistory();
        }
      } catch {
        setChat((c) => [
          ...c,
          { role: "error", text: "通信エラーが発生しました。もう一度お試しください。" },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pending, token, refreshPreview, showHistory, loadHistory],
  );

  const restore = useCallback(
    async (versionId: string) => {
      const res = await fetch("/api/edit/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, versionId }),
      });
      if (res.ok) {
        setChat((c) => [
          ...c,
          { role: "assistant", text: "選択したバージョンに復元しました。" },
        ]);
        refreshPreview();
        loadHistory();
      }
    },
    [token, refreshPreview, loadHistory],
  );

  const toggleHistory = useCallback(() => {
    setShowHistory((s) => {
      const next = !s;
      if (next) loadHistory();
      return next;
    });
  }, [loadHistory]);

  return (
    <div className={styles.shell}>
      <section className={styles.chat}>
        <div className={styles.chatHead}>
          <h1>{facilityName} の編集</h1>
          <p>AIに日本語で指示するだけで、右のホームページが変わります。</p>
        </div>

        <div className={styles.messages} ref={messagesRef}>
          {chat.length === 0 ? (
            <p className={styles.hint}>
              例:「営業時間は平日9時〜16時です」「送迎ありと載せて」
              <br />
              下のボタンからも試せます。
            </p>
          ) : (
            chat.map((m, i) => (
              <div
                key={i}
                className={`${styles.msg} ${
                  m.role === "user"
                    ? styles.user
                    : m.role === "error"
                      ? styles.error
                      : styles.assistant
                }`}
              >
                {m.text}
              </div>
            ))
          )}
          {pending ? (
            <div className={`${styles.msg} ${styles.assistant}`}>反映しています…</div>
          ) : null}
        </div>

        <div className={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className={styles.chip}
              onClick={() => send(s)}
              disabled={pending}
            >
              {s}
            </button>
          ))}
        </div>

        <div className={styles.composer}>
          <textarea
            value={input}
            placeholder="変更したい内容を書いてください"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
          />
          <button
            className={styles.send}
            onClick={() => send(input)}
            disabled={pending || input.trim().length === 0}
          >
            送信
          </button>
        </div>
      </section>

      <section className={styles.preview} style={{ position: "relative" }}>
        <div className={styles.previewBar}>
          <span>ライブプレビュー（非公開）</span>
          <div className={styles.actions}>
            <button className={styles.barBtn} onClick={refreshPreview}>
              更新
            </button>
            <button className={styles.barBtn} onClick={toggleHistory}>
              変更履歴
            </button>
          </div>
        </div>
        {showHistory ? (
          <div className={styles.history}>
            {versions.length === 0 ? (
              <p className={styles.histMeta} style={{ padding: "0.5rem" }}>
                履歴を読み込み中…
              </p>
            ) : (
              versions.map((v) => (
                <div className={styles.histItem} key={v.id}>
                  <span>
                    {ORIGIN_LABEL[v.origin] ?? v.origin}
                    <br />
                    <span className={styles.histMeta}>
                      {new Date(v.createdAt).toLocaleString("ja-JP")}
                    </span>
                  </span>
                  {v.isCurrent ? (
                    <span className={styles.current}>現在</span>
                  ) : (
                    <button className={styles.restore} onClick={() => restore(v.id)}>
                      復元
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : null}
        <div className={styles.frameWrap}>
          <iframe key={previewKey} src={previewUrl} title="プレビュー" />
        </div>
      </section>
    </div>
  );
}
