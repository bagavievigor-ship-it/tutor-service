"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchAuthed } from "@/lib/api";

type NotificationOut = {
  id: number;
  user_id: number;
  type: string; // new_message | new_response | assigned ...
  entity_id: number | null; // у тебя это ID заявки
  title: string;
  body: string | null;
  is_read: number;
  created_at: string;
};

function buildOpenHref(n: NotificationOut): string | null {
  if (!n.entity_id) return null;

  const base = `/requests/${n.entity_id}`;

  if (n.type === "new_response") return `${base}#responses`;
  if (n.type === "new_message") return `${base}#chat`;
  if (n.type === "assigned") return `${base}#chat`;

  return base;
}

export default function NotificationBell() {
  const router = useRouter();

  const [isAuthed, setIsAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [items, setItems] = useState<NotificationOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsAuthed(!!localStorage.getItem("r18_token"));
  }, []);

  async function loadUnreadCount() {
    try {
      const res = await apiFetchAuthed("/me/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      const c = typeof data?.count === "number" ? data.count : 0;
      setUnreadCount(c);
    } catch {
      // токен может быть отсутствовать/протухнуть — просто молчим
    }
  }

  async function loadLatestUnread() {
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "15");
      qs.set("offset", "0");
      qs.set("unread_only", "true");

      const res = await apiFetchAuthed(`/me/notifications?${qs.toString()}`);
      if (!res.ok) {
        const t = await res.text();
        setError(`Ошибка: ${res.status} ${t}`);
        setItems([]);
        return;
      }
      const data = (await res.json()) as NotificationOut[];
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки");
      setItems([]);
    }
  }

  async function markRead(id: number) {
    setBusyId(id);
    try {
      const res = await apiFetchAuthed(`/me/notifications/${id}/read`, { method: "POST" });
      if (!res.ok) return;

      setUnreadCount((c) => Math.max(0, c - 1));
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    } finally {
      setBusyId(null);
    }
  }

  const label = useMemo(() => {
    if (!unreadCount) return "Уведомления";
    return `Уведомления (${unreadCount})`;
  }, [unreadCount]);

  // Пуллим счётчик
  useEffect(() => {
    if (!isAuthed) return;
    loadUnreadCount();
    const t = setInterval(loadUnreadCount, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // Закрытие при клике вне
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const el = boxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // При открытии загружаем непрочитанные
  useEffect(() => {
    if (!open || !isAuthed) return;
    loadLatestUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAuthed]);

  if (!isAuthed) return null;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          border: "1px solid #ddd",
          background: "white",
          borderRadius: 10,
          padding: "6px 10px",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 18 }} aria-hidden>
          🔔
        </span>

        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              background: "crimson",
              color: "white",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid white",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 360,
            maxWidth: "90vw",
            border: "1px solid #eee",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 10px 24px rgba(0,0,0,.08)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <div style={{ padding: 10, borderBottom: "1px solid #f0f0f0", display: "flex", gap: 10 }}>
            <div style={{ fontWeight: 700, flex: 1 }}>Новые уведомления</div>
            <a href="/me/notifications" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              Все →
            </a>
          </div>

          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {error && <div style={{ padding: 10, color: "crimson" }}>{error}</div>}

            {items === null ? (
              <div style={{ padding: 10, color: "#666" }}>Загружаю…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 10, color: "#666" }}>Новых уведомлений нет.</div>
            ) : (
              items.map((n) => {
                const href = buildOpenHref(n);
                const created = new Date(n.created_at).toLocaleString();

                return (
                  <div key={n.id} style={{ padding: 10, borderBottom: "1px solid #f6f6f6" }}>
                    <div style={{ fontSize: 12, color: "#777" }}>{created}</div>
                    <div style={{ marginTop: 4, fontWeight: 700, fontSize: 14 }}>{n.title}</div>
                    {n.body && <div style={{ marginTop: 4, fontSize: 13, whiteSpace: "pre-wrap" }}>{n.body}</div>}

                    <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                      {href ? (
                        <button
                          type="button"
                          disabled={busyId === n.id}
                          onClick={async () => {
                            await markRead(n.id);
                            setOpen(false);
                            router.push(href);
                          }}
                          style={{
                            border: "1px solid #ddd",
                            background: "white",
                            borderRadius: 10,
                            padding: "6px 10px",
                            cursor: "pointer",
                          }}
                        >
                          Открыть
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#777" }}>Нет ссылки</span>
                      )}

                      <button
                        type="button"
                        disabled={busyId === n.id}
                        onClick={() => markRead(n.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#555",
                          cursor: "pointer",
                          textDecoration: "underline",
                          fontSize: 13,
                        }}
                      >
                        {busyId === n.id ? "…" : "Прочитано"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
