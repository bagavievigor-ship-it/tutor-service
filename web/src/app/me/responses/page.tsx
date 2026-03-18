"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type MyResponseOut = {
  id: number;
  request_id: number;
  from_user_id: number;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;

  request_subject?: string | null;
  request_slug?: string | null;
};

function responseStatusLabel(status: string) {
  switch (status) {
    case "sent":
      return "В ожидании";
    case "accepted":
      return "Выбран";
    case "declined":
      return "Не выбран";
    default:
      return status || "—";
  }
}

function responseStatusClass(status: string) {
  switch (status) {
    case "sent":
      return "badge badgePrimary";
    case "accepted":
      return "badge badgeSuccess";
    case "declined":
      return "badge badgeMuted";
    default:
      return "badge";
  }
}

export default function MyResponsesPage() {
  const [items, setItems] = useState<MyResponseOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetchAuthed("/me/responses");
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
          <div style={{ fontWeight: 700 }}>Пока нет откликов</div>
          <div className="subtle">Найдите подходящую заявку и отправьте отклик.</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link className="btn btnPrimary" href="/requests">Смотреть заявки</Link>
          </div>
        </div>
      );

    return (
      <div className="stack" style={{ gap: 12 }}>
        {items.map((r) => {
          const slug = r.request_slug ?? "";
          const href = slug ? `/requests/${r.request_id}-${slug}` : `/requests/${r.request_id}`;
          return (
            <div key={r.id} className="card cardPad stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div className="stack" style={{ gap: 6 }}>
                  <div style={{ fontWeight: 800 }}>
                    {r.request_subject ? r.request_subject : `Заявка #${r.request_id}`}
                  </div>
                  <div className="subtle">Отправлено: {new Date(r.created_at).toLocaleString()}</div>
                </div>

                <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span className={responseStatusClass(r.status)}>{responseStatusLabel(r.status)}</span>
                  <Link className="btn" href={href}>Открыть заявку</Link>
                </div>
              </div>

              <div className="divider" />

              <div className="prose">{r.message}</div>
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
          <h1>Мои отклики</h1>
          <p className="subtle">Отслеживайте, выбран ли ваш отклик.</p>
        </div>

        {content}
      </div>
    </main>
  );
}
