"use client";

// 配信停止の確認ボタン。ワンクリックの誤操作（メールスキャナの先読み）を避けるため、
// 明示的にボタンを押したときだけ API(POST) を呼ぶ。

import { useState } from "react";

type Status = "idle" | "sending" | "done" | "error";

export function UnsubscribeClient({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleClick() {
    setStatus("sending");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p>配信を停止しました。今後この案内はお送りしません。ご確認ありがとうございました。</p>;
  }

  return (
    <div>
      <p>今後の配信を停止する場合は、下のボタンを押してください。</p>
      <button type="button" onClick={handleClick} disabled={status === "sending"}>
        {status === "sending" ? "処理中…" : "配信を停止する"}
      </button>
      {status === "error" && (
        <p role="alert">停止処理に失敗しました。時間をおいて再度お試しください。</p>
      )}
    </div>
  );
}
