"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type MyRequestOut = {
  id: number;
  author_user_id: number;

  request_kind: "student" | "broker";
  subject: string;
  level: string;
  format: "online" | "offline" | "mixed";
  city: string | null;

  commission_type?: "fixed" | "lessons" | null;
  commission_value?: number | null;
  currency?: "RUB" | "KZT" | null;

  status: string;
  slug: string;

  responses_count?: number;

  assigned_user_id: number | null;
  assigned_at: string | null;

  created_at: string;
  updated_at: string;
};

function formatLabel(v: MyRequestOut["format"]) {
  if (v === "online") return "Онлайн";
  if (v === "offline") return "Оффлайн";
  return "Смешанный";
}

function statusLabel(status: string) {
  switch (status) {
    case "open":
      return "Открыта";
    case "assigned":
      return "Исполнитель выбран";
    case "in_work":
      return "В работе";
    case "closed":
      return "Закрыта";
    case "archived":
      return "Архив";
    default:
      return status || "—";
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}


function requestKindBadge(kind: MyRequestOut["request_kind"]) {
  return kind === "broker" ? { text: "🤝 Посредник", cls: "badge badgeWarning" } : { text: "👤 Ученик", cls: "badge badgeMuted" };
}

function formatCommission(r: Pick<MyRequestOut, "commission_type" | "commission_value" | "currency">): string | null {
  const raw = (r.commission_type || "").trim();
  if (raw && !r.commission_value) return raw;

  const t = r.commission_type ?? null;
  const v = r.commission_value ?? null;
  if (!t || !v) return null;
  if (t === "lessons") return `${v} занятия`;
  const cur = (r.currency || "RUB").toUpperCase();
  const sign = cur === "KZT" ? "₸" : "₽";
  return `${v} ${sign}`;
}


function statusClass(status: string) {
  switch (status) {
    case "open":
      return "badge badgePrimary";
    case "assigned":
      return "badge badgeSuccess";
    case "in_work":
      return "badge badgeWarning";
    case "closed":
      return "badge badgeMuted";
    case "archived":
      return "badge";
    default:
      return "badge";
  }
}

async function reopenRequest(id: number) {
  const res = await apiFetchAuthed(`/requests/${id}/reopen`, { method: 'POST' });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Не удалось открыть заявку заново: ${res.status} ${t}`);
  }
  return await res.json();
}

async function closeRequest(id: number) {
  const res = await apiFetchAuthed(`/requests/${id}/close`, { method: "POST" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Не удалось закрыть заявку: ${res.status} ${t}`);
  }
  return await res.json();
}

async function openRequest(id: number) {
  const res = await apiFetchAuthed(`/requests/${id}/open`, { method: "POST" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Не удалось открыть заявку: ${res.status} ${t}`);
  }
  return await res.json();
}

export default function MyRequestsPage() {
  const [items, setItems] = useState<MyRequestOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetchAuthed("/me/requests");
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Ошибка загрузки: ${res.status} ${t}`);
        }
        setItems(await res.json());
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки");
      }
    })();
  }, []);

  const content = useMemo(() => {
    if (error) return <div className="card cardPad"><div className="subtle">{error}</div></div>;
    if (!items) return <div className="card cardPad"><div className="subtle">Загрузка…</div></div>;
    if (items.length === 0)
      return (
        <div className="card cardPad stack">
          <div style={{ fontWeight: 700 }}>Пока нет заявок</div>
          <div className="subtle">Создайте заявку — и репетиторы смогут отправлять отклики.</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link className="btn btnPrimary" href="/requests/new">Разместить заявку</Link>
            <Link className="btn" href="/requests">Смотреть все заявки</Link>
          </div>
        </div>
      );

    return (
      <div className="stack" style={{ gap: 12 }}>
        {items.map((r) => {
          const href = `/requests/${r.id}-${r.slug}`;
          return (
            <div key={r.id} className="card cardPad">
              <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{r.subject}</div>

                  <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                    <span className={statusClass(r.status)}>{statusLabel(r.status)}</span>
                    <span className="badge badgeMuted" title="Количество откликов">💬 {Number(r.responses_count ?? 0)}</span>

{r.request_kind ? (
  <span className={requestKindBadge(r.request_kind).cls}>
    {requestKindBadge(r.request_kind).text}
  </span>
) : null}
{r.request_kind === "broker" ? (
  <span className="badge badgeMuted" title="Комиссия посредника">
    💸 {formatCommission(r) ?? "—"}
  </span>
) : null}
                    <span className="badge">{r.level}</span>
                    <span className="badge">{formatLabel(r.format)}</span>
                    {r.city ? <span className="badge badgeMuted">{r.city}</span> : null}
                  </div>

                  <div className="subtle">Обновлено: {fmtDate(r.updated_at)}</div>
                </div>

                <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Link className="btn" href={href}>Подробнее</Link>

                  {(r.status || "").toLowerCase() === "open" ? (
                    <button
                      className="btn"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          await closeRequest(r.id);
                          const res2 = await apiFetchAuthed('/me/requests');
                          if (res2.ok) setItems(await res2.json());
                        } catch (err: any) {
                          setError(err?.message ?? 'Ошибка');
                        }
                      }}
                    >
                      Закрыть заявку
                    </button>
                  ) : null}

                  {(r.status || "").toLowerCase() === "closed" ? (
                    <button
                      className="btn btnPrimary"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          await openRequest(r.id);
                          const res2 = await apiFetchAuthed('/me/requests');
                          if (res2.ok) setItems(await res2.json());
                        } catch (err: any) {
                          setError(err?.message ?? 'Ошибка');
                        }
                      }}
                    >
                      Открыть заявку
                    </button>
                  ) : null}

                  {(r.status || '').toLowerCase() === 'assigned' ? (
                    <button
                      className="btn"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          await reopenRequest(r.id);
                          // перезагрузим список
                          const res2 = await apiFetchAuthed('/me/requests');
                          if (res2.ok) setItems(await res2.json());
                        } catch (err: any) {
                          setError(err?.message ?? 'Ошибка');
                        }
                      }}
                    >
                      Поменять репетитора
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [items, error]);

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <div className="stack" style={{ gap: 6 }}>
            <h1>Мои заявки</h1>
            <p className="subtle">Управляйте своими заявками и выбирайте исполнителя из откликов.</p>
          </div>

          <Link className="btn btnPrimary" href="/requests/new">
            + Создать заявку
          </Link>
        </div>

        {content}
      </div>
    </main>
  );
}
