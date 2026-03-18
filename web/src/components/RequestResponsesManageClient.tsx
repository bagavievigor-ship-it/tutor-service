"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchAuthed, getToken } from "@/lib/api";

type ResponseUserOut = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

type ResponseTutorOut = {
  user_id: number;
  display_name: string;
  slug: string;
};

type ResponseOut = {
  id: number;
  request_id: number;
  from_user_id: number;
  message: string;
  status: string;
  created_at: string;
  user?: ResponseUserOut | null;
  tutor?: ResponseTutorOut | null;
};

function nameOf(u?: ResponseUserOut | null) {
  if (!u) return "Репетитор";
  const parts = [u.first_name, u.last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return u.username ? `@${u.username}` : "Репетитор";
}


function normalizeTelegramUrl(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;

  // @username -> https://t.me/username
  if (s.startsWith("@")) return `https://t.me/${s.slice(1)}`;

  // t.me/username -> https://t.me/username
  if (s.startsWith("t.me/") || s.startsWith("telegram.me/")) return `https://${s}`;

  // https://t.me/username
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  // plain username
  return `https://t.me/${s}`;
}


function statusLabel(s?: string) {
  const v = (s || "").toLowerCase();
  if (v === "accepted") return "Выбран";
  if (v === "declined") return "Не выбран";
  return s || "—";
}

function statusClass(s?: string) {
  const v = (s || "").toLowerCase();
  if (v === "accepted") return "badge badgeSuccess";
  if (v === "declined") return "badge badgeMuted";
  return "badge";
}

function initialsOf(u?: ResponseUserOut | null): string {
  const a = (u?.first_name || "").trim();
  const b = (u?.last_name || "").trim();
  const s = (a ? a[0] : "") + (b ? b[0] : "");
  return s || (u?.username ? String(u.username).slice(0, 2).toUpperCase() : "?");
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function RequestResponsesManageClient({
  requestId,
  requestStatus,
  onAccepted,
}: {
  requestId: number;
  requestStatus?: string;
  onAccepted?: (threadId?: number) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ResponseOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyTgId, setBusyTgId] = useState<number | null>(null);

  const canManage = useMemo(() => Boolean(getToken()), []);

  useEffect(() => {
    if (!canManage) return;
    (async () => {
      try {
        const res = await apiFetchAuthed(`/requests/${requestId}/responses`);
        if (res.status === 403) {
          // не автор — просто не показываем блок
          setItems([]);
          return;
        }
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Ошибка загрузки откликов: ${res.status} ${t}`);
        }
        setItems(await res.json());
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки откликов");
      }
    })();
  }, [requestId, canManage]);

  const accept = async (responseId: number) => {
    setBusyId(responseId);
    try {
      const res = await apiFetchAuthed(`/responses/${responseId}/accept`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Не удалось выбрать исполнителя: ${res.status} ${t}`);
      }
      const data = await res.json();
      // Перезагрузим список
      const list = await apiFetchAuthed(`/requests/${requestId}/responses`);
      if (list.ok) setItems(await list.json());
      if (onAccepted) onAccepted(data.thread_id);
      else if (data?.thread_id) router.push(`/me/threads/${data.thread_id}`);
      else router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка");
    } finally {
      setBusyId(null);
    }
  };

  const openTelegram = async (tutor?: ResponseTutorOut | null, responseId?: number) => {
    const slug = tutor?.slug;
    if (!slug) return;

    setBusyTgId(responseId ?? null);
    try {
      const res = await apiFetch(`/tutors/by-slug/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Не удалось загрузить контакты репетитора");
      const data = await res.json();
      const url = normalizeTelegramUrl(String(data?.telegram_contact || ""));
      if (!url) throw new Error("У репетитора не указан Telegram");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message ?? "Ошибка");
    } finally {
      setBusyTgId(null);
    }
  };


  if (!canManage) return null;
  if (error) return <div className="card cardPad"><div className="subtle">{error}</div></div>;
  if (!items) return <div className="card cardPad"><div className="subtle">Загрузка откликов…</div></div>;

  // если не автор — список станет [] из-за 403
  if (items.length === 0) return null;

  const isOpen = (requestStatus || "").toLowerCase() === "open";

  return (
    <div className="card cardPad stack">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Отклики на заявку</div>
      <div className="subtle">Выберите репетитора — заявка перейдёт в статус «Исполнитель выбран» и откроется чат.</div>

      <div className="stack" style={{ gap: 10 }}>
        {items.map((r) => (
          <div key={r.id} className="card cardPad" style={{ background: "var(--bg)" }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="stack" style={{ gap: 6, minWidth: 220 }}>
                <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div className="msgAvatar" style={{ width: 28, height: 28 }} title={r.tutor?.display_name || nameOf(r.user)}>
                    {r.user?.photo_url ? (
                      <img src={r.user.photo_url} alt="" />
                    ) : (
                      <span style={{ fontWeight: 800, fontSize: 12 }}>{initialsOf(r.user)}</span>
                    )}
                  </div>

                  <span style={{ fontWeight: 700 }}>
                    {r.tutor?.display_name || nameOf(r.user)}
                  </span>

                  {(() => {
                    const v = (r.status || "").toLowerCase();
                    if (v === "accepted" || v === "declined") {
                      return <span className={statusClass(r.status)}>{statusLabel(r.status)}</span>;
                    }
                    return null;
                  })()}
                </div>
                <div className="subtle">{fmtDate(r.created_at)}</div>
              </div>

            </div>

            <div className="divider" />

            <div className="prose" style={{ whiteSpace: "pre-wrap" }}>{r.message}</div>

            <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
              {r.tutor ? (
                <>
                <Link
                  className="btn"
                  href={`/tutors/${(r.tutor as any).tutor_id ?? r.tutor.user_id}-${r.tutor.slug}`}
                >
                  Анкета репетитора
                </Link>
                <button
                  className="btn"
                  onClick={() => openTelegram(r.tutor, r.id)}
                  disabled={busyTgId === r.id}
                  title="Открыть чат в Telegram"
                >
                  {busyTgId === r.id ? "Открываю…" : "Написать в Telegram"}
                </button>

                </>
              ) : null}
              
              {isOpen && (r.status || "").toLowerCase() !== "accepted" ? (
                <button
                  className="btn btnPrimary"
                  onClick={() => accept(r.id)}
                  disabled={busyId === r.id}
                >
                  {busyId === r.id ? "Выбираю…" : "Выбрать исполнителем"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="subtle">
        После выбора исполнителя вы сможете общаться в чате. Если потребуется — можно будет поменять репетитора.
      </div>

      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link className="btn" href="/me/requests">Мои заявки</Link>
        <Link className="btn" href="/me/threads">Мои чаты</Link>
      </div>
    </div>
  );
}