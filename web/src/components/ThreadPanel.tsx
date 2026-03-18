"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type ThreadOut = {
  id: number;
  request_id: number;
  author_user_id: number;
  tutor_user_id: number;
};

type MessageOut = {
  id: number;
  thread_id: number;
  sender_user_id: number;
  text: string;
};

function friendlyError(status: number, bodyText: string): string {
  if (status === 401) return "Нужно войти через Telegram заново.";
  if (status === 403) return "Недостаточно прав для чата (вы не участник).";
  if (status === 404) return "Чат ещё не создан (исполнитель не назначен).";

  try {
    const j = JSON.parse(bodyText);
    if (j?.detail && typeof j.detail === "string") return j.detail;
  } catch {
    // ignore
  }

  return bodyText || `Ошибка запроса (HTTP ${status})`;
}

export default function ThreadPanel({
  requestId,
  requestStatus,
}: {
  requestId: number;
  requestStatus: string;
}) {
  const [thread, setThread] = useState<ThreadOut | null>(null);
  const [messages, setMessages] = useState<MessageOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const isAuthed = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("r18_token");
  }, []);

  async function loadThreadAndMessages() {
    setError(null);

    // чат показываем только после назначения
    if (requestStatus !== "assigned") {
      setThread(null);
      setMessages(null);
      return;
    }

    // 1) получаем thread по request_id
    const thRes = await apiFetchAuthed(`/threads/by-request/${requestId}`);
    if (!thRes.ok) {
      const t = await thRes.text();
      setError(friendlyError(thRes.status, t));
      setThread(null);
      setMessages(null);
      return;
    }
    const th = (await thRes.json()) as ThreadOut;
    setThread(th);

    // 2) сообщения
    const msgRes = await apiFetchAuthed(`/threads/${th.id}/messages`);
    if (!msgRes.ok) {
      const t = await msgRes.text();
      setError(friendlyError(msgRes.status, t));
      setMessages(null);
      return;
    }
    setMessages((await msgRes.json()) as MessageOut[]);
  }

  useEffect(() => {
    if (!isAuthed) return;
    loadThreadAndMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, requestId, requestStatus]);

  async function send() {
    setError(null);

    const trimmed = text.trim();
    if (!trimmed) return;

    if (!thread) {
      setError("Чат ещё не готов.");
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetchAuthed(`/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      if (!res.ok) {
        const t = await res.text();
        setError(friendlyError(res.status, t));
        return;
      }

      setText("");
      await loadThreadAndMessages();
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthed) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
        <b>Чат</b>
        <div style={{ marginTop: 8 }}>
          Чтобы писать в чате — нужно <a href="/login">войти через Telegram</a>.
        </div>
      </div>
    );
  }

  if (requestStatus !== "assigned") {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
        <b>Чат</b>
        <div style={{ marginTop: 8, color: "#666" }}>
          Чат появится после того, как автор заявки выберет исполнителя.
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
      <b>Чат</b>

      {error && <pre style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 10 }}>{error}</pre>}

      <div style={{ marginTop: 12 }}>
        {messages === null ? (
          <div>Загружаю сообщения…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: "#666" }}>Сообщений пока нет.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, color: "#666" }}>sender_user_id={m.sender_user_id}</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Напишите сообщение…"
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <button disabled={busy || !text.trim()} onClick={send} style={{ marginTop: 8 }}>
          {busy ? "Отправляю…" : "Отправить"}
        </button>
      </div>
    </div>
  );
}
