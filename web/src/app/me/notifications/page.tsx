"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type ThreadOut = { id: number; request_id: number; created_at?: string };

type NotificationOut = {
  id: number;
  user_id: number;
  type: string;
  entity_id: number | null;
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

type MeOut = {
  id: number;
  telegram_id: number | null | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  created_at?: string;
  tg_chat_id?: number | null;
  tg_notify_enabled?: number | boolean;
};

type LinkTokenOut = {
  start_param: string;
  start_url?: string | null;
};

function typeLabel(t: string) {
  const v = (t || "").toLowerCase();
  if (v === "new_response") return "Новый отклик";
  if (v === "new_message") return "Сообщение в чате";
  if (v === "assigned") return "Исполнитель выбран";
  if (v === "unassigned") return "Выбор отменён";
  if (v === "offer") return "Предложение заявки";
  return t || "Уведомление";
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationOut[] | null>(null);
  const [threads, setThreads] = useState<ThreadOut[] | null>(null);
  const [me, setMe] = useState<MeOut | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        // profile for Telegram notifications settings
        try {
          const mr = await apiFetchAuthed("/me");
          if (mr.ok) setMe(await mr.json());
        } catch {
          setMe(null);
        }

        const res = await apiFetchAuthed("/me/notifications");
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Ошибка загрузки: ${res.status} ${t}`);
        }
        setItems(await res.json());

        // threads нужны, чтобы построить ссылку на чат по request_id
        try {
          const tr = await apiFetchAuthed("/me/threads");
          if (tr.ok) setThreads(await tr.json());
        } catch {
          setThreads(null);
        }
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки");
      }
    })();
  }, []);

  const markRead = async (id: number) => {
    // оптимистично отмечаем прочитанным
    setItems((prev) =>
      prev ? prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)) : prev
    );
    try {
      await apiFetchAuthed(`/me/notifications/${id}/read`, { method: "POST" });
    } catch {
      // если не получилось — просто не мешаем переходу
    }
    try {
      window.dispatchEvent(new Event("r18-notifications-changed"));
    } catch {
      // ignore
    }
  };

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  const connectTelegram = async () => {
    if (!botUsername) {
      alert("Не задан NEXT_PUBLIC_TELEGRAM_BOT_USERNAME");
      return;
    }
    setTgBusy(true);
    try {
      const r = await apiFetchAuthed("/telegram/link-token", { method: "POST" });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Не удалось создать ссылку: ${r.status} ${t}`);
      }
      const data = (await r.json()) as LinkTokenOut;
      const url = `https://t.me/${botUsername}?start=${encodeURIComponent(data.start_param)}`;
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message ?? "Ошибка подключения");
    } finally {
      setTgBusy(false);
    }
  };

  const toggleTelegram = async (enabled: boolean) => {
    setTgBusy(true);
    try {
      const r = await apiFetchAuthed("/me/telegram-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Не удалось сохранить: ${r.status} ${t}`);
      }
      const upd = await r.json();
      setMe((prev) => ({ ...(prev as any), tg_notify_enabled: upd.tg_notify_enabled, tg_chat_id: upd.tg_chat_id }));
    } catch (e: any) {
      alert(e?.message ?? "Ошибка");
    } finally {
      setTgBusy(false);
    }
  };

  const content = useMemo(() => {
    if (error) return <div className="card cardPad"><div className="subtle">{error}</div></div>;
    if (!items) return <div className="card cardPad"><div className="subtle">Загрузка…</div></div>;
    if (items.length === 0)
      return (
        <div className="card cardPad stack">
          <div style={{ fontWeight: 700 }}>Пока нет уведомлений</div>
          <div className="subtle">Когда появятся новые отклики или сообщения — они будут здесь.</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link className="btn" href="/requests">Смотреть заявки</Link>
            <Link className="btn" href="/me/threads">Мои чаты</Link>
          </div>
        </div>
      );

    return (
      <div className="stack" style={{ gap: 12 }}>
        {items.map((n) => {
          const t = (n.type || "").toLowerCase();
          let href: string | null = null;

          if ((t === "new_response" || t === "assigned" || t === "unassigned" || t === "offer") && n.entity_id) {
            href = `/requests/${n.entity_id}`;
          }

          if (t === "new_message" && n.entity_id) {
            if (threads) {
              const th = threads.find((x) => Number(x.request_id) === Number(n.entity_id));
              href = th ? `/me/threads/${th.id}` : "/me/threads";
            } else {
              href = "/me/threads";
            }
          }

          const badgeClass = n.is_read ? "badge badgeMuted" : "badge badgePrimary";
          const bg = n.is_read ? "#f3f4f6" : "var(--surface)";

          const CardInner = (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className={badgeClass}>{n.is_read ? "Прочитано" : "Новое"}</span>
                  <span className="badge">{typeLabel(n.type)}</span>
                </div>
                <div className="subtle">{fmtDate(n.created_at)}</div>
              </div>

              {n.title ? <div style={{ fontWeight: 700 }}>{n.title}</div> : null}
              {n.body ? <div className="subtle">{n.body}</div> : null}

              {href ? <div className="subtle">Открыть →</div> : null}
            </div>
          );

          if (href) {
            return (
              <Link
                key={n.id}
                href={href}
                className="card cardPad cardLink"
                style={{ display: "block", background: bg }}
                onClick={() => {
                  if (!n.is_read) markRead(n.id);
                }}
              >
                {CardInner}
              </Link>
            );
          }

          return (
            <div key={n.id} className="card cardPad" style={{ background: bg }}>
              {CardInner}
            </div>
          );
        })}
      </div>
    );
  }, [items, error, threads]);

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <h1>Уведомления</h1>
          <p className="subtle">Отклики на заявки и сообщения в чатах.</p>
        </div>

        <div className="card cardPad stack" id="telegram" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Telegram-уведомления</div>
            <span className={me?.tg_chat_id ? "badge badgeSuccess" : "badge badgeMuted"}>
              {me?.tg_chat_id ? "Подключено" : "Не подключено"}
            </span>
          </div>

          <div className="subtle">
            Получайте важные события сразу в Telegram — даже если сайт закрыт.
          </div>

          <ul className="subtle" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Новые отклики, назначения, сообщения в чате</li>
            <li>Мгновенно и без лишних вкладок</li>
            <li>Можно выключить в один клик</li>
          </ul>

          <div className="subtle">
            Telegram не позволяет боту писать первым — нужно один раз нажать «Start».
          </div>

          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {!me?.tg_chat_id ? (
              <button className="btn btnPrimary" onClick={connectTelegram} disabled={tgBusy}>
                Подключить Telegram
              </button>
            ) : (
              <label className="row" style={{ gap: 10, alignItems: "center", cursor: tgBusy ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(me?.tg_notify_enabled === 1 || me?.tg_notify_enabled === true)}
                  disabled={tgBusy}
                  onChange={(e) => toggleTelegram(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 600 }}>Отправлять уведомления в Telegram</span>
              </label>
            )}
          </div>
        </div>

        {content}
      </div>
    </main>
  );
}
