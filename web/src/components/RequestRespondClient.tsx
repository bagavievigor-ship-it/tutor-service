"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed, getToken } from "@/lib/api";

type MyResponseOut = { id: number; request_id: number; status: string };

function isOpen(status: string | null | undefined) {
  return (status || "").toLowerCase() === "open";
}

export default function RequestRespondClient({
  requestId,
  status,
  authorUserId,
  assignedUserId,
}: {
  requestId: number;
  status?: string;
  authorUserId?: number | null;
  assignedUserId?: number | null;
}) {
  const [myResponses, setMyResponses] = useState<MyResponseOut[] | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [hasTutorProfile, setHasTutorProfile] = useState<boolean | null>(null);

  const [threadId, setThreadId] = useState<number | null>(null);

  const [openForm, setOpenForm] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ kind: "need_login" | "need_profile" | "sent" | "error"; text: string } | null>(null);

  const isAuthor = useMemo(() => {
    if (!authorUserId || !meId) return false;
    return Number(authorUserId) === Number(meId);
  }, [authorUserId, meId]);

  const alreadyResponded = useMemo(() => {
    return !!myResponses?.some((r) => r.request_id === requestId);
  }, [myResponses, requestId]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // 0) me
    apiFetchAuthed("/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u: any) => {
        const id = Number(u?.id);
        setMeId(Number.isFinite(id) ? id : null);
      })
      .catch(() => setMeId(null));

    // 1) responses
    apiFetchAuthed("/me/responses")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows: any) => {
        if (Array.isArray(rows)) setMyResponses(rows as MyResponseOut[]);
      })
      .catch(() => null);

    // 2) tutor profile
    apiFetchAuthed("/tutors/me/exists")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((t: any) => {
        setHasTutorProfile(!!t && !!t.exists);
      })
      .catch(() => setHasTutorProfile(false));
  }, []);

  const isAssignee = useMemo(() => {
    if (!assignedUserId || !meId) return false;
    return Number(assignedUserId) === Number(meId);
  }, [assignedUserId, meId]);

  // If I'm the assignee and request isn't open -> load thread id for "Start chat"
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (!isAssignee) return;
    if (isOpen(status)) return;

    apiFetchAuthed(`/threads/by-request/${requestId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((t: any) => {
        const id = Number(t?.id);
        setThreadId(Number.isFinite(id) ? id : null);
      })
      .catch(() => setThreadId(null));
  }, [isAssignee, status, requestId]);

  const clickRespond = () => {
    setInfo(null);

    const token = getToken();
    if (!token) {
      setInfo({ kind: "need_login", text: "Чтобы откликнуться, нужно войти." });
      return;
    }

    if (hasTutorProfile === false) {
      setInfo({ kind: "need_profile", text: "Чтобы откликаться на заявки, заполните анкету репетитора." });
      return;
    }

    setOpenForm((v) => !v);
  };

  const send = async () => {
    setBusy(true);
    setInfo(null);
    try {
      const body = { request_id: requestId, text: draft.trim() };
      const res = await apiFetchAuthed("/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || String(res.status));
      }

      setDraft("");
      setOpenForm(false);
      setInfo({ kind: "sent", text: "Отклик отправлен ✅" });

      // обновим список откликов
      const r2 = await apiFetchAuthed("/me/responses");
      if (r2.ok) {
        const rows = await r2.json();
        if (Array.isArray(rows)) setMyResponses(rows as MyResponseOut[]);
      }
    } catch (e: any) {
      setInfo({ kind: "error", text: e?.message ?? "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  if (isAuthor) {
    return null;
  }

  if (!isOpen(status)) {
    if (isAssignee) {
      return (
        <div className="card cardPad">
          <div className="title">Вы выбраны исполнителем по этой заявке</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            Теперь можете начать чат с заказчиком.
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            {threadId ? (
              <Link className="btn btnPrimary" href={`/me/threads/${threadId}`}>
                Начать чат
              </Link>
            ) : (
              <button
                className="btn btnPrimary"
                onClick={async () => {
                  try {
                    const r = await apiFetchAuthed(`/threads/by-request/${requestId}`);
                    if (!r.ok) throw new Error(await r.text().catch(() => ""));
                    const t = await r.json();
                    const id = Number(t?.id);
                    if (Number.isFinite(id) && id > 0) {
                      window.location.href = `/me/threads/${id}`;
                      return;
                    }
                    throw new Error("Чат ещё не создан");
                  } catch {
                    setInfo({ kind: "error", text: "Не удалось открыть чат." });
                  }
                }}
              >
                Начать чат
              </button>
            )}
          </div>

          {info?.kind === "error" && info.text ? (
            <div className="subtle" style={{ marginTop: 10 }}>
              {info.text}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="card cardPad">
        <div className="subtle">Отклики на эту заявку больше не принимаются.</div>
      </div>
    );
  }

  if (alreadyResponded) {
    return (
      <div className="card cardPad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div className="title">Вы уже откликнулись</div>
          <span className="badge badgeWarning">В ожидании</span>
        </div>
        <div className="subtle" style={{ marginTop: 6 }}>
          Следите за статусом в разделе «Мои отклики».
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href="/me/responses">
            Мои отклики
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card cardPad">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div className="title">Отклик на заявку</div>
        <button className="btn btnPrimary" onClick={clickRespond}>
          {openForm ? "Скрыть" : "Откликнуться"}
        </button>
      </div>

      {openForm ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            className="input"
            style={{ minHeight: 96 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Коротко опишите, как будете работать, опыт, цену, время…"
          />
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <button className="btn btnPrimary" onClick={send} disabled={busy || !draft.trim()}>
              {busy ? "Отправляю…" : "Отправить отклик"}
            </button>
            <button className="btn" onClick={() => setOpenForm(false)} disabled={busy}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {info?.kind === "need_login" ? (
        <div className="card cardPad cardDashed" style={{ marginTop: 12 }}>
          <div className="title">Нужен вход</div>
          <div className="subtle">{info.text}</div>
          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <Link className="btn btnPrimary" href="/login">
              Войти
            </Link>
          </div>
        </div>
      ) : null}

      {info?.kind === "need_profile" ? (
        <div className="card cardPad cardDashed" style={{ marginTop: 12 }}>
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

      {info?.kind === "sent" ? (
        <div className="subtle" style={{ marginTop: 10 }}>{info.text}</div>
      ) : null}

      {info?.kind === "error" && info.text ? (
        <div className="subtle" style={{ marginTop: 10 }}>Ошибка: {info.text}</div>
      ) : null}
    </div>
  );
}
