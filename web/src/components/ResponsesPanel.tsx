"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type MeOut = {
  id: number;
  telegram_id: number | null | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

type ResponseOut = {
  id: number;
  request_id: number;
  from_user_id: number;
  message: string;
  status: string;
  created_at: string;

  // Optional tutor profile fields (available when backend includes expanded response data)
  tutor_username?: string | null;
  tutor_first_name?: string | null;
  tutor_last_name?: string | null;
  telegram_contact?: string | null;
};

function displayTutorName(r: ResponseOut): string {
  const full = [r.tutor_first_name, r.tutor_last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (r.tutor_username) return `@${r.tutor_username.replace(/^@/, "")}`;
  return `Пользователь #${r.from_user_id}`;
}

function extractDetail(bodyText: string): string | null {
  try {
    const j = JSON.parse(bodyText);
    if (j?.detail && typeof j.detail === "string") return j.detail;
  } catch {
    // ignore
  }
  return null;
}

function friendlyError(status: number, bodyText: string): string {
  if (status === 409) return "Вы уже откликались на эту заявку. Повторный отклик запрещён.";
  if (status === 401) return "Нужно войти через Telegram заново.";

  if (status === 403) {
    const detail = extractDetail(bodyText);
    if (detail && detail.includes("анкету репетитора")) {
      return "Чтобы откликаться, нужно заполнить анкету репетитора. Перейдите в “Моя анкета репетитора”.";
    }
    return "Недостаточно прав для этого действия.";
  }

  if (status === 404) return "Не найдено (возможно, заявка удалена).";

  const detail = extractDetail(bodyText);
  if (detail) return detail;

  return bodyText || `Ошибка запроса (HTTP ${status})`;
}

export default function ResponsesPanel({
  requestId,
  authorUserId,
  requestStatus,
}: {
  requestId: number;
  authorUserId: number;
  requestStatus: string;
}) {
  const [me, setMe] = useState<MeOut | null>(null);
  const [responses, setResponses] = useState<ResponseOut[] | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [needsTutorProfile, setNeedsTutorProfile] = useState(false);

  const isAuthed = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("r18_token");
  }, []);

  const isAuthor = me?.id === authorUserId;

  async function loadMe() {
    const res = await apiFetchAuthed("/me");
    if (!res.ok) throw new Error(`GET /me failed: ${res.status}`);
    setMe(await res.json());
  }

  async function loadResponses() {
    const res = await apiFetchAuthed(`/requests/${requestId}/responses`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(friendlyError(res.status, t));
    }
    setResponses(await res.json());
  }

  useEffect(() => {
    if (!isAuthed) return;

    (async () => {
      try {
        await loadMe();
      } catch {
        // молча
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    if (!me) return;
    if (!isAuthor) return;

    (async () => {
      try {
        await loadResponses();
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки откликов");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  async function submitResponse() {
    setError(null);
    setInfo(null);
    setNeedsTutorProfile(false);

    const trimmed = message.trim();
    if (!trimmed || trimmed.length < 3) {
      setError("Сообщение минимум 3 символа.");
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetchAuthed(`/requests/${requestId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const t = await res.text();

        if (res.status === 403) {
          const d = extractDetail(t);
          if (d && d.includes("анкету репетитора")) {
            setNeedsTutorProfile(true);
          }
        }

        throw new Error(friendlyError(res.status, t));
      }

      setMessage("");
      setInfo("Отклик отправлен ✅");
    } catch (e: any) {
      setError(e?.message ?? "Ошибка отправки отклика");
    } finally {
      setBusy(false);
    }
  }

  async function acceptResponse(responseId: number) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await apiFetchAuthed(`/responses/${responseId}/accept`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(friendlyError(res.status, t));
      }
      setInfo("Исполнитель назначен ✅");
      await loadResponses();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка назначения");
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthed) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, marginTop: 18 }}>
        <b>Отклики</b>
        <div style={{ marginTop: 8 }}>
          Чтобы откликнуться или видеть отклики — нужно <a href="/login">войти через Telegram</a>.
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, marginTop: 18 }}>
        <b>Отклики</b>
        <div style={{ marginTop: 8 }}>Загружаю профиль…</div>
      </div>
    );
  }

  if (isAuthor) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, marginTop: 18 }}>
        <b>Отклики</b>

        {requestStatus !== "open" && (
          <div style={{ marginTop: 8, color: "#666" }}>
            Заявка уже не “open”. Новые отклики не принимаются, назначение недоступно.
          </div>
        )}

        {error && <pre style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 10 }}>{error}</pre>}
        {info && <div style={{ color: "green", marginTop: 10 }}>{info}</div>}

        <div style={{ marginTop: 12 }}>
          {responses === null ? (
            <div>Загружаю отклики…</div>
          ) : responses.length === 0 ? (
            <div>Пока нет откликов.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {responses.map((r) => (
                <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    От: <b>{displayTutorName(r)}</b> · user_id={r.from_user_id} · {new Date(r.created_at).toLocaleString()} · <b>{r.status}</b>
                  </div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{r.message}</div>

                  {requestStatus === "open" && r.status === "sent" && (
                    <button disabled={busy} onClick={() => acceptResponse(r.id)} style={{ marginTop: 10 }}>
                      Выбрать этого репетитора
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, marginTop: 18 }}>
      <b>Откликнуться</b>

      {requestStatus !== "open" ? (
        <div style={{ marginTop: 8, color: "#666" }}>Заявка закрыта/назначена — откликнуться нельзя.</div>
      ) : (
        <>
          {needsTutorProfile && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #f2d7a6", background: "#fff7e6" }}>
              Чтобы откликаться, нужно заполнить анкету репетитора.{" "}
              <a href="/tutors/me"><b>Открыть анкету</b></a>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Напиши коротко: опыт, условия, когда готов начать"
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </div>

          {error && <pre style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 10 }}>{error}</pre>}
          {info && <div style={{ color: "green", marginTop: 10 }}>{info}</div>}

          <button disabled={busy} onClick={submitResponse} style={{ marginTop: 10 }}>
            {busy ? "Отправляю…" : "Отправить отклик"}
          </button>

          <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
            Контакты не раскрываем — дальше будет чат внутри сервиса после назначения.
          </div>
        </>
      )}
    </div>
  );
}
