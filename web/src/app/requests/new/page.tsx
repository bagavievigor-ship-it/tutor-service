"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchAuthed } from "@/lib/api";

type RequestKind = "student" | "broker";
type Format = "online" | "offline" | "mixed";

function parseCommission(input: string): {
  commission_type: "fixed" | "lessons" | null;
  commission_value: number | null;
  currency: "RUB" | "KZT" | null;
  error?: string;
} {
  const s = (input || "").trim();
  if (!s) {
    return { commission_type: null, commission_value: null, currency: null, error: "Комиссия обязательна для заявки посредника" };
  }

  const numMatch = s.replace(",", ".").match(/(\d+(\.\d+)?)/);
  if (!numMatch) {
    return { commission_type: null, commission_value: null, currency: null, error: "Не нашёл число в комиссии. Пример: “2 занятия” или “1500 ₽”" };
  }

  const value = Math.round(Number(numMatch[1]));
  if (!Number.isFinite(value) || value <= 0) {
    return { commission_type: null, commission_value: null, currency: null, error: "Некорректное число комиссии" };
  }

  const lower = s.toLowerCase();

  // lessons
  if (lower.includes("зан") || lower.includes("урок") || lower.includes("урк") || lower.includes("lesson")) {
    return { commission_type: "lessons", commission_value: value, currency: null };
  }

  // fixed: RUB/KZT by symbols/words
  if (s.includes("₽") || lower.includes("руб") || lower.includes("rub")) {
    return { commission_type: "fixed", commission_value: value, currency: "RUB" };
  }
  if (lower.includes("kzt") || lower.includes("тг") || lower.includes("тенге") || s.includes("₸")) {
    return { commission_type: "fixed", commission_value: value, currency: "KZT" };
  }

  // default RUB if user wrote just "1500"
  return { commission_type: "fixed", commission_value: value, currency: "RUB" };
}

export default function NewRequestPage() {
  const router = useRouter();

  const [requestKind, setRequestKind] = useState<RequestKind>("student");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [format, setFormat] = useState<Format>("online");
  const [city, setCity] = useState("");
  const [budgetText, setBudgetText] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [description, setDescription] = useState("");

  const [commissionInput, setCommissionInput] = useState("");
  const [turboEnabled, setTurboEnabled] = useState(true);

  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");

  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commissionParsed = useMemo(() => {
    if (requestKind !== "broker") return null;
    return parseCommission(commissionInput);
  }, [requestKind, commissionInput]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!subject.trim() || subject.trim().length < 2) return setError("Заполни предмет (минимум 2 символа).");
    if (!level.trim() || level.trim().length < 1) return setError("Заполни уровень.");
    if (description.trim() && description.trim().length < 10) return setError("Если заполняешь описание — сделай минимум 10 символов (или оставь пустым).");

    let commission_type: "fixed" | "lessons" | null = null;
    let commission_value: number | null = null;
    let currency: "RUB" | "KZT" | null = null;

    if (requestKind === "broker") {
      const c = (commissionInput || "").trim();
      if (!c) return setError("Заполни комиссию (можно текстом: “2 занятия”, “1500 ₽”, “по договорённости”).");
      // Храним как есть в commission_type, чтобы можно было писать не только цифры
      commission_type = c as any;
      commission_value = null;
      currency = null;
    }

    const payload: any = {
      request_kind: requestKind,
      subject: subject.trim(),
      level: level.trim(),
      format,
      city: city.trim() ? city.trim() : null,
      budget_text: budgetText.trim() ? budgetText.trim() : null,
      schedule_text: scheduleText.trim() ? scheduleText.trim() : null,
      description: description.trim(),
      turbo_enabled: turboEnabled,

      // комиссия (только broker)
      commission_type,
      commission_value,
      currency,

      // SEO
      seo_title: seoTitle.trim() ? seoTitle.trim() : null,
      seo_description: seoDescription.trim() ? seoDescription.trim() : null,
    };

    // для student: комиссия должна быть null (API валидирует)
    if (requestKind === "student") {
      payload.commission_type = null;
      payload.commission_value = null;
      payload.currency = null;
    }

    setSubmitting(true);
    try {
      const res = await apiFetchAuthed("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ошибка API: ${res.status} ${text}`);
      }

      const created = await res.json();
      router.push(`/requests/${created.id}-${created.slug}`);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="container stack">
        <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="pageHeader" style={{ marginBottom: 0 }}>
            <h1>Создать заявку</h1>
            <p className="subtle">Опишите задачу — репетиторы смогут отправить отклики.</p>
          </div>

          <a className="btn" href="/requests">← К заявкам</a>
        </div>

        <form className="card cardPad stack" style={{ gap: 14 }} onSubmit={onSubmit}>
          {error ? (
            <div className="subtle" style={{ color: "var(--danger)" }}>{error}</div>
          ) : null}

          <div className="grid2">
            <label className="stack" style={{ gap: 6 }}>
              <div className="subtle">Кто размещает</div>
              <select className="input" value={requestKind} onChange={(e) => setRequestKind(e.target.value as any)}>
                <option value="student">Ученик</option>
                <option value="broker">Посредник</option>
              </select>
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <div className="subtle">Формат</div>
              <select className="input" value={format} onChange={(e) => setFormat(e.target.value as any)}>
                <option value="online">Онлайн</option>
                <option value="offline">Оффлайн</option>
                <option value="mixed">Смешанный</option>
              </select>
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <div className="subtle">Предмет</div>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Например: математика" />
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <div className="subtle">Уровень</div>
              <input className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Например: 8 класс / ОГЭ / ЕГЭ" />
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <div className="subtle">Город (если оффлайн)</div>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Необязательно" />
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <div className="subtle">Бюджет</div>
              <input className="input" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} placeholder="Например: 2000₽/час" />
            </label>
          </div>

          {requestKind === "broker" ? (
            <div className="card cardPad stack" style={{ gap: 8 }}>
              <div style={{ fontWeight: 800 }}>Комиссия посредника</div>
              <div className="subtle">Примеры: «2 занятия» или «1500 ₽»</div>
              <input className="input" value={commissionInput} onChange={(e) => setCommissionInput(e.target.value)} placeholder="Комиссия" />
            </div>
          ) : null}

          <label className="stack" style={{ gap: 6 }}>
            <div className="subtle">График / пожелания по времени</div>
            <input className="input" value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} placeholder="Например: 2 раза в неделю после 18:00" />
          </label>

          <label className="stack" style={{ gap: 6 }}>
            <div className="subtle">Описание</div>
            <textarea className="input" rows={7} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Опишите задачу, цели, сроки, важные детали…" />
          </label>

          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={turboEnabled} onChange={(e) => setTurboEnabled(e.target.checked)} />
              <span style={{ fontWeight: 700 }}>Турбо</span>
              <span className="subtle">(автоматический репост в наш ТГ канал)</span>
            </label>

            <button className="btn btnPrimary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Отправка…" : "Создать заявку"}
            </button>
          </div>

          <details className="card" style={{ padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>SEO (необязательно)</summary>
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              <label className="stack" style={{ gap: 6 }}>
                <div className="subtle">SEO заголовок</div>
                <input className="input" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Заявка: репетитор по математике" />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <div className="subtle">SEO описание</div>
                <textarea className="input" rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder="Короткое описание для поисковых систем" />
              </label>
            </div>
          </details>
        </form>
      </div>
    </main>
  );
}
