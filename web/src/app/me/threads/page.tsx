"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type MyThreadOut = {
  id: number;
  request_id: number;
  author_user_id: number;
  tutor_user_id: number;
  created_at: string;

  request_subject?: string | null;
  request_slug?: string | null;
};


function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function MyThreadsPage() {
  const [items, setItems] = useState<MyThreadOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetchAuthed("/me/threads");
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
          <div style={{ fontWeight: 700 }}>Пока нет чатов</div>
          <div className="subtle">
            Чат появляется, когда автор заявки выбирает исполнителя (или когда вы начинаете диалог по выбранной заявке).
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link className="btn btnPrimary" href="/requests">Смотреть заявки</Link>
          </div>
        </div>
      );

    return (
      <div className="stack" style={{ gap: 12 }}>
        {items.map((t) => {
          const slug = t.request_slug ?? "";
          const requestHref = slug ? `/requests/${t.request_id}-${slug}` : `/requests/${t.request_id}`;
          const threadHref = `/me/threads/${t.id}`;

          return (
            <div key={t.id} className="card cardPad row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="stack" style={{ gap: 6 }}>
                <div style={{ fontWeight: 800 }}>
                  {t.request_subject ? t.request_subject : `Заявка #${t.request_id}`}
                </div>
                <div className="subtle">Обновлено: {formatDate(t.created_at)}</div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Link className="btn" href={requestHref}>Заявка</Link>
                <Link className="btn btnPrimary" href={threadHref}>Открыть чат</Link>
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
          <h1>Чаты</h1>
          <p className="subtle">Диалоги по заявкам.</p>
        </div>

        {content}
      </div>
    </main>
  );
}
