"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";

type RequestOut = {
  id: number;
  subject: string;
  level: string;
  format: string;
  status: string;
  slug: string;
  city: string | null;
};

function formatLabel(v: string) {
  if (v === "online") return "Онлайн";
  if (v === "offline") return "Оффлайн";
  if (v === "mixed") return "Смешанный";
  return v;
}

export default function OfferRequestModal({
  open,
  onClose,
  toTutorUserId,
  tutorName,
}: {
  open: boolean;
  onClose: () => void;
  toTutorUserId: number;
  tutorName?: string | null;
}) {
  const [items, setItems] = useState<RequestOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneText, setDoneText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDoneText(null);
    setSelectedId(null);
    setItems(null);
    (async () => {
      try {
        const res = await apiFetchAuthed("/requests/mine");
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Ошибка загрузки заявок: ${res.status} ${t}`);
        }
        const data = (await res.json()) as RequestOut[];
        const openOnes = data.filter((r) => (r.status || "").toLowerCase() === "open");
        setItems(openOnes);
        if (openOnes.length === 1) setSelectedId(openOnes[0].id);
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки");
        setItems([]);
      }
    })();
  }, [open]);

  const canSend = useMemo(() => !!selectedId && !busy, [selectedId, busy]);

  async function send() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetchAuthed("/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: selectedId, to_tutor_user_id: toTutorUserId }),
      });

      if (res.status === 409) {
        setDoneText("Вы уже предлагали эту заявку этому репетитору.");
        return;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Не удалось отправить: ${res.status} ${t}`);
      }

      setDoneText("Предложение отправлено.");
    } catch (e: any) {
      setError(e?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // закрытие по клику на затемнение
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 1000,
      }}
    >
      <div className="card cardPad" style={{ width: 520, maxWidth: "95vw" }}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
            <div className="stack" style={{ gap: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Предложить заявку</div>
              <div className="subtle">
                Репетитор: <b>{tutorName || `ID ${toTutorUserId}`}</b>
              </div>
            </div>
            <button className="btn" type="button" onClick={onClose}>
              Закрыть
            </button>
          </div>

          {error ? <div className="subtle" style={{ color: "crimson" }}>{error}</div> : null}
          {doneText ? <div className="subtle" style={{ color: "var(--success)" }}>{doneText}</div> : null}

          {items === null ? (
            <div className="subtle">Загружаю ваши открытые заявки…</div>
          ) : items.length === 0 ? (
            <div className="card cardPad" style={{ boxShadow: "none" }}>
              <div style={{ fontWeight: 700 }}>Нет открытых заявок</div>
              <div className="subtle" style={{ marginTop: 6 }}>
                Чтобы предложить заявку репетитору, создайте заявку со статусом «Открыта».
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Выберите заявку</div>
              <div className="stack" style={{ gap: 8, maxHeight: 320, overflow: "auto", paddingRight: 4 }}>
                {items.map((r) => {
                  const checked = r.id === selectedId;
                  return (
                    <label
                      key={r.id}
                      className="card cardPad"
                      style={{
                        boxShadow: "none",
                        cursor: "pointer",
                        borderColor: checked ? "rgba(37,99,235,.6)" : "var(--border)",
                      }}
                    >
                      <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                        <input
                          type="radio"
                          name="offer_request"
                          checked={checked}
                          onChange={() => setSelectedId(r.id)}
                          style={{ marginTop: 2 }}
                        />
                        <div className="stack" style={{ gap: 6 }}>
                          <div style={{ fontWeight: 800 }}>
                            #{r.id} · {r.subject}
                          </div>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span className="badge">{r.level}</span>
                            <span className="badge">{formatLabel(r.format)}</span>
                            {r.city ? <span className="badge badgeMuted">{r.city}</span> : null}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                <button className="btn" type="button" onClick={onClose} disabled={busy}>
                  Отмена
                </button>
                <button className="btn btnPrimary" type="button" onClick={send} disabled={!canSend}>
                  {busy ? "Отправляю…" : "Отправить"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
