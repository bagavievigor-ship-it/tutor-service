"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed, getToken } from "@/lib/api";

export type RequestOut = {
  id: number;
  author_user_id: number;
  request_kind?: string;
  commission_type?: string | null;
  commission_value?: number | null;
  currency?: string | null;
  subject: string;
  level: string;
  format: string;
  city: string | null;
  budget_text: string | null;
  schedule_text: string | null;
  description?: string | null;
  slug: string;
  status: string;
  responses_count?: number;
  created_at?: string;

  // Admin (user_id=1) can hide requests from public / non-admin lists.
  admin_hidden?: boolean;
};

type MyResponseOut = {
  id: number;
  request_id: number;
  status: string;
};

function toSearchText(r: RequestOut): string {
  const parts = [
    r.subject,
    r.level,
    r.format,
    r.city ?? "",
    r.budget_text ?? "",
    r.schedule_text ?? "",
    r.description ?? "",
    r.slug ?? "",
    r.status ?? "",
    String(r.id),
  ];
  return parts.join(" ").toLowerCase();
}

function requestStatusLabel(status: string): { text: string; tone: "muted" | "primary" | "success" | "warning" } {
  switch (status) {
    case "open":
      return { text: "Открыта", tone: "success" };
    case "assigned":
      return { text: "Исполнитель выбран", tone: "primary" };
    case "in_work":
      return { text: "В работе", tone: "warning" };
    case "closed":
      return { text: "Закрыта", tone: "muted" };
    case "archived":
      return { text: "Архив", tone: "muted" };
    default:
      return { text: status || "—", tone: "muted" };
  }
}

function badgeClass(tone: "muted" | "primary" | "success" | "warning"): string {
  switch (tone) {
    case "success":
      return "badge badgeSuccess";
    case "primary":
      return "badge badgePrimary";
    case "warning":
      return "badge badgeWarning";
    default:
      return "badge badgeMuted";
  }
}

function lessonWord(n: number): string {
  const nn = Math.abs(n) % 100;
  const n1 = nn % 10;
  if (nn > 10 && nn < 20) return "уроков";
  if (n1 === 1) return "урок";
  if (n1 >= 2 && n1 <= 4) return "урока";
  return "уроков";
}

function formatCommission(r: RequestOut): string | null {
  if (r.request_kind !== "broker") return null;
  const t = (r.commission_type || "").trim();
  const v = r.commission_value;

  // New behavior: commission may be a free-form text (e.g. "2 занятия", "по договоренности").
  // In that case we store it in commission_type and leave commission_value null.
  if (!Number.isFinite(v as number)) {
    return t ? t : null;
  }

  const vv = Number(v);
  if (t === "lessons") return `${vv} ${lessonWord(vv)}`;

  const cur = (r.currency || "RUB").toUpperCase();
  if (cur === "KZT") return `${vv} ₸`;
  return `${vv} ₽`;
}

function requestKindBadge(r: RequestOut): { text: string; cls: string } | null {
  const k = (r.request_kind || "").toLowerCase();
  if (k === "broker") return { text: "Посредник", cls: "badge badgePrimary" };
  if (k === "student") return { text: "Ученик", cls: "badge badgeMuted" };
  return null;
}

function line(label: string, value: string | null | undefined) {
  return (
    <div className="subtle">
      <span className="muted">{label}</span> {value && value.trim() ? value : "—"}
    </div>
  );
}

export default function RequestsListClient({ items }: { items: RequestOut[] }) {
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [myResponses, setMyResponses] = useState<MyResponseOut[] | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [hasTutorProfile, setHasTutorProfile] = useState<boolean | null>(null);

  const [requests, setRequests] = useState<RequestOut[]>(items);

  const [openRespondForId, setOpenRespondForId] = useState<number | null>(null);
  const [draftById, setDraftById] = useState<Record<number, string>>({});
  const [busyById, setBusyById] = useState<Record<number, boolean>>({});
  const [infoById, setInfoById] = useState<Record<number, { kind: "need_login" | "need_profile" | "sent" | "error"; text: string }>>(
    {}
  );

  // Load "my responses" and "do I have a tutor profile" only when authed.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setMyResponses(null);
      setHasTutorProfile(null);
      setMeId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [resMe, resResponses, resTutor] = await Promise.allSettled([
          apiFetchAuthed("/me"),
          apiFetchAuthed("/me/responses"),
          apiFetchAuthed("/tutors/me/exists"),
        ]);

        if (!cancelled) {
          if (resMe.status === "fulfilled" && resMe.value.ok) {
            const me = (await resMe.value.json().catch(() => null)) as any;
            const id = Number(me?.id);
            const safeId = Number.isFinite(id) ? id : null;
            setMeId(safeId);

            // If admin (user_id=1), refetch list including hidden requests.
            if (safeId === 1) {
              try {
                const resAll = await apiFetchAuthed(`/requests?include_hidden=1`);
                if (resAll.ok) {
                  const data = await resAll.json();
                  if (Array.isArray(data)) setRequests(data as RequestOut[]);
                }
              } catch {
                // ignore
              }
            }
          } else {
            setMeId(null);
          }

          if (resResponses.status === "fulfilled" && resResponses.value.ok) {
            const data = (await resResponses.value.json()) as MyResponseOut[];
            setMyResponses(data);
          } else {
            setMyResponses([]);
          }

          if (resTutor.status === "fulfilled" && resTutor.value.ok) {
            const data = (await resTutor.value.json()) as any;
            setHasTutorProfile(!!data && !!data.exists);
          } else {
            setHasTutorProfile(false);
          }
        }
      } catch {
        if (!cancelled) {
          setMyResponses([]);
          setHasTutorProfile(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const respondedSet = useMemo(() => {
    const set = new Set<number>();
    (myResponses ?? []).forEach((r) => set.add(r.request_id));
    return set;
  }, [myResponses]);

  const toggleHidden = async (r: RequestOut) => {
    if (meId !== 1) return;
    try {
      const res = await apiFetchAuthed(`/requests/${r.id}/admin_hidden`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !r.admin_hidden }),
      });
      if (!res.ok) return;
      const updated = (await res.json().catch(() => null)) as any;
      if (!updated) return;
      setRequests((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = onlyOpen ? requests.filter((r) => (r.status || "").toLowerCase() === "open") : requests;
    if (!qq) return base;
    return base.filter((r) => toSearchText(r).includes(qq));
  }, [requests, q, onlyOpen]);

  async function submitResponse(requestId: number) {
    const msg = (draftById[requestId] ?? "").trim();
    if (msg.length < 3) {
      setInfoById((p) => ({ ...p, [requestId]: { kind: "error", text: "Напишите хотя бы 3 символа." } }));
      return;
    }

    setBusyById((p) => ({ ...p, [requestId]: true }));
    setInfoById((p) => ({ ...p, [requestId]: { kind: "error", text: "" } }));

    try {
      const res = await apiFetchAuthed(`/requests/${requestId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Не удалось отправить отклик.");
      }

      // Optimistically mark as responded
      setMyResponses((prev) => {
        const safe = prev ?? [];
        if (safe.some((x) => x.request_id === requestId)) return safe;
        return [{ id: -Date.now(), request_id: requestId, status: "sent" }, ...safe];
      });

      setOpenRespondForId(null);
      setDraftById((p) => ({ ...p, [requestId]: "" }));
      setInfoById((p) => ({ ...p, [requestId]: { kind: "sent", text: "Отклик отправлен" } }));
    } catch (e: any) {
      setInfoById((p) => ({ ...p, [requestId]: { kind: "error", text: e?.message || "Ошибка отправки отклика." } }));
    } finally {
      setBusyById((p) => ({ ...p, [requestId]: false }));
    }
  }

  function onClickRespond(requestId: number) {
    // reset any previous info for this card
    setInfoById((p) => {
      const n = { ...p };
      delete n[requestId];
      return n;
    });

    const token = getToken();
    if (!token) {
      setInfoById((p) => ({
        ...p,
        [requestId]: {
          kind: "need_login",
          text: "Чтобы откликнуться, нужно войти.",
        },
      }));
      return;
    }

    if (hasTutorProfile === false) {
      setInfoById((p) => ({
        ...p,
        [requestId]: {
          kind: "need_profile",
          text: "Чтобы откликаться на заявки, заполните анкету репетитора.",
        },
      }));
      return;
    }

    setOpenRespondForId((cur) => (cur === requestId ? null : requestId));
  }

  return (
    <div className="stack">
      <div className="card cardPad row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: 2 }}>
          <div style={{ fontWeight: 800 }}>Поиск</div>
          <div className="subtle">Предмет, класс/уровень, город, формат…</div>
        </div>

        <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input className="input" style={{ flex: "1 1 260px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: математика онлайн" />

          <label className="row" style={{ gap: 8, userSelect: "none" }}>
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            <span className="subtle">Только открытые</span>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card cardPad">
          <div style={{ fontWeight: 800 }}>Ничего не найдено</div>
          <div className="subtle">Попробуйте изменить запрос.</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {filtered.map((r) => {
            const isAuthor = meId != null && Number(r.author_user_id) === Number(meId);
            const st = requestStatusLabel(r.status);
            const statusClass = badgeClass(st.tone);

            const alreadyResponded = respondedSet.has(r.id);
            const canRespond = r.status === "open" && !alreadyResponded && !isAuthor;

            const href = `/requests/${r.id}-${r.slug}`;

            const info = infoById[r.id];
            const isOpenForm = openRespondForId === r.id;

            return (
              <div key={r.id} className="card cardPad">
                <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div className="stack" style={{ gap: 6, minWidth: 220 }}>
                    <Link href={href} className="cardLink" style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>
                      📘 {r.subject}
                    </Link>
                    <div className="subtle">🆔 #{r.id}</div>
                  </div>

                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={statusClass}>{st.text}</span>
                    <span className="badge badgeMuted" title="Количество откликов">
                      💬 {Number(r.responses_count ?? 0)}
                    </span>
                    {meId === 1 && r.admin_hidden ? <span className="badge badgeWarning">🙈 скрыто</span> : null}
                    {(() => {
                      const kb = requestKindBadge(r);
                      return kb ? <span className={kb.cls}>{kb.text}</span> : null;
                    })()}

                    {alreadyResponded ? <span className="badge badgeMuted">Вы уже откликнулись</span> : null}
                  </div>
                </div>

                {line("🎓 Класс / уровень:", r.level)}
                {line("💻 Формат:", r.format)}
                {line("📍 Город:", r.city)}
                {line("💰 Бюджет:", r.budget_text)}
                {(() => {
                  const c = formatCommission(r);
                  return c ? line("💸 Комиссия:", c) : null;
                })()}

                {line("🕒 График:", r.schedule_text)}

                <div className="prose" style={{ marginTop: 10, fontSize: 13, color: "var(--text)" }}>
                  {(() => {
                    const desc = (r.description || "").trim();
                    if (!desc) return null;
                    return desc.length > 260 ? desc.slice(0, 257) + "…" : desc;
                  })()}
                </div>

                <div className="divider" style={{ marginTop: 12, marginBottom: 12 }} />

                <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <Link className="btn" href={href}>
                    Подробнее
                  </Link>

                  {meId === 1 ? (
                    <button className="btn" onClick={() => toggleHidden(r)} title="Скрыть/показать заявку в списке">
                      {r.admin_hidden ? "Показать" : "Скрыть"}
                    </button>
                  ) : null}

                  {canRespond ? (
                    <button className="btn btnPrimary" onClick={() => onClickRespond(r.id)}>
                      Откликнуться
                    </button>
                  ) : null}
                </div>

                {info?.kind === "need_login" ? (
                  <div className="card cardPad cardDashed" style={{ marginTop: 10 }}>
                    <div className="title">Нужен вход</div>
                    <div className="subtle">{info.text}</div>
                    <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                      <Link className="btn btnPrimary" href="/login">
                        Войти
                      </Link>
                      <button className="btn" onClick={() => setInfoById((p) => ({ ...p, [r.id]: { kind: "error", text: "" } }))}>
                        Закрыть
                      </button>
                    </div>
                  </div>
                ) : null}

                {info?.kind === "need_profile" ? (
                  <div className="card cardPad cardDashed" style={{ marginTop: 10 }}>
                    <div className="title">Сначала анкета</div>
                    <div className="subtle">{info.text}</div>

                    <div className="subtle" style={{ marginTop: 8 }}>
                      <div>✅ Больше доверия: анкета с опытом и ценой</div>
                      <div>✅ Ученики выбирают из откликнувшихся — вы уже в списке</div>
                      <div style={{ marginTop: 6 }}>⏱ Анкета займёт ~2 минуты</div>
                    </div>

                    <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                      <Link className="btn btnPrimary" href="/tutors/me">
                        Создать анкету
                      </Link>
                      <Link className="btn" href="/tutors">
                        Посмотреть репетиторов
                      </Link>
                    </div>
                  </div>
                ) : null}

                {isOpenForm ? (
                  <div className="card" style={{ marginTop: 10, padding: 12 }}>
                    <div style={{ fontWeight: 800 }}>Ваш отклик</div>
                    <div className="subtle">
                      Коротко опишите, чем вы полезны и как быстро можете начать.
                    </div>
                    <textarea
                      className="input"
                      style={{ marginTop: 10, minHeight: 92, resize: "vertical" }}
                      value={draftById[r.id] ?? ""}
                      onChange={(e) => setDraftById((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="Например: Я готов(а) заниматься 2 раза в неделю онлайн, есть опыт подготовки…"
                    />
                    {info?.kind === "error" && info.text ? (
                      <div className="subtle" style={{ marginTop: 8, color: "var(--danger)" }}>
                        {info.text}
                      </div>
                    ) : null}
                    <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btnPrimary" disabled={!!busyById[r.id]} onClick={() => submitResponse(r.id)}>
                        {busyById[r.id] ? "Отправляю…" : "Отправить отклик"}
                      </button>
                      <button className="btn" onClick={() => setOpenRespondForId(null)}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : null}

                {info?.kind === "sent" ? (
                  <div className="subtle" style={{ marginTop: 10 }}>
                    ✅ {info.text}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
