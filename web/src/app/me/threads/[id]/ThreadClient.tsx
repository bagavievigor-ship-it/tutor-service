"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type ThreadOut = {
  id: number;
  request_id: number;
  author_user_id: number;
  tutor_user_id: number;
  created_at?: string;
};

type MessageOut = {
  id: number;
  thread_id: number;
  sender_user_id: number;
  text: string;
  created_at?: string;
  read_at?: string | null;
};

type RequestOut = {
  id: number;
  subject: string;
  level: string;
  format: string;
  city?: string | null;
  created_at?: string;
  status?: string;
  request_kind?: string;
};

type UserPublicOut = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}


async function reopenRequest(requestId: number) {
  const res = await apiFetchAuthed(`/requests/${requestId}/reopen`, { method: 'POST' });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Не удалось открыть заявку заново: ${res.status} ${t}`);
  }
  return await res.json();
}

export default function ThreadClient({ threadId }: { threadId: number | null }) {

  const [thread, setThread] = useState<ThreadOut | null>(null);
  const [me, setMe] = useState<UserPublicOut | null>(null);
  const [peer, setPeer] = useState<UserPublicOut | null>(null);
  const [req, setReq] = useState<RequestOut | null>(null);
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    setError(null);
    try {
      const [tRes, mRes, meRes] = await Promise.all([
        apiFetchAuthed(`/threads/${threadId}`),
        apiFetchAuthed(`/threads/${threadId}/messages`),
        apiFetchAuthed(`/me`),
      ]);

      if (!tRes.ok) throw new Error("Не удалось загрузить чат.");
      if (!mRes.ok) throw new Error("Не удалось загрузить сообщения.");

      const t = (await tRes.json()) as ThreadOut;
      const ms = (await mRes.json()) as MessageOut[];
      const meData = (await meRes.json()) as UserPublicOut;

      setThread(t);
      setMessages(ms);
      setMe(meData);

      // загрузим данные заявки и второго участника
      try {
        const reqRes = await apiFetchAuthed(`/requests/${t.request_id}`);
        if (reqRes.ok) setReq(await reqRes.json());
      } catch {}

      const peerId = Number(t.author_user_id) === Number(meData.id) ? t.tutor_user_id : t.author_user_id;
      try {
        const uRes = await apiFetchAuthed(`/users/${peerId}`);
        if (uRes.ok) setPeer(await uRes.json());
      } catch {
        setPeer(null);
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки.");
    }
  }

  useEffect(() => {
    if (threadId === null || !Number.isFinite(threadId) || threadId <= 0) {
      setError("Некорректный чат.");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function send() {
    const text = draft.trim();
    if (text.length < 1) return;

    setSending(true);
    setError(null);

    try {
      const res = await apiFetchAuthed(`/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("Не удалось отправить сообщение.");

      setDraft("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Ошибка отправки.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 className="h1">Чат</h1>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Link className="btn" href="/me/threads">
                Назад
              </Link>
              {thread ? (
                <Link className="btn" href={`/requests/${thread.request_id}`}>
                  Заявка
                </Link>
              ) : null}
            </div>
          </div>
          {thread ? <div className="subtle">Создан: {formatDate(thread.created_at)}</div> : null}
        </div>

        {error ? (
          <div className="card cardPad">
          {me && thread && thread.author_user_id === me.id ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await reopenRequest(thread.request_id);
                    // после reopen чат удалён, возвращаемся в мои заявки
                    window.location.href = '/me/requests';
                  } catch (e: any) {
                    alert(e?.message ?? 'Ошибка');
                  }
                }}
              >
                Поменять репетитора
              </button>
              <Link className="btn" href={`/requests/${thread.request_id}`}>Открыть заявку</Link>
            </div>
          ) : null}
            <div style={{ fontWeight: 800 }}>Ошибка</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              {error}
            </div>
          </div>
        ) : null}

        {req ? (
          <div className="chatMeta stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div className="chatMetaTitle">
                {req.subject} · {req.level}
              </div>
              <div className="subtle">
                {req.created_at ? formatDate(req.created_at) : "—"}
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="badge">{req.format}</span>
              {req.city ? <span className="badge">{req.city}</span> : null}
              {req.request_kind ? <span className="badge">{req.request_kind === "broker" ? "Посредник" : "Ученик"}</span> : null}
              {req.status ? <span className="badge badgeMuted">{req.status === "closed" ? "Закрыта" : req.status}</span> : null}
            </div>
            <div className="subtle">
              Собеседник: {peer ? (peer.first_name || peer.username || "Пользователь") : "—"}
            </div>
          </div>
        ) : null}

        <div className="card cardPad chatMessages" style={{ minHeight: 220 }}>
          {messages.length === 0 ? (
            <div className="subtle">Сообщений пока нет.</div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {messages.map((m) => {
                const isMine = !!me && Number(m.sender_user_id) === Number(me.id);
                const u = isMine ? me : peer;
                const name = u ? (u.first_name || u.username || "Пользователь") : (isMine ? "Вы" : "Собеседник");
                const bubbleClass = `msgBubble ${isMine ? "mine" : "their"}`;
                // По просьбе: все сообщения выравниваем по левому краю (единый поток),
                // но фон оставляем разным для "моих" и "чужих".
                const rowClass = `msgRow`;

                const initials = (() => {
                  const a = (u?.first_name || "").trim();
                  const b = (u?.last_name || "").trim();
                  const s = (a ? a[0] : "") + (b ? b[0] : "");
                  return s || (u?.username ? String(u.username).slice(0, 2).toUpperCase() : "?");
                })();

                return (
                  <div key={m.id} className={rowClass}>
                    <div className="msgAvatar" title={isMine ? "Вы" : name}>
                      {u?.photo_url ? <img src={u.photo_url} alt="" /> : <span style={{ fontWeight: 800 }}>{initials}</span>}
                    </div>

                    <div className={bubbleClass}>
                      <div className="msgName">{isMine ? "Вы" : name}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                      <div className="msgTime">{formatDate(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card cardPad">
          <div style={{ fontWeight: 800 }}>Сообщение</div>
          <textarea
            className="input"
            style={{ marginTop: 10, minHeight: 92, resize: "vertical" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Напишите сообщение…"
          />
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <button className="btn btnPrimary" disabled={sending || draft.trim().length === 0} onClick={send}>
              {sending ? "Отправляю…" : "Отправить"}
            </button>
            <button className="btn" disabled={sending} onClick={load}>
              Обновить
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}