import type { Metadata } from "next";
import { buildAlternates } from "@/seo/site";

import RequestRespondClient from "@/components/RequestRespondClient";
import RequestResponsesManageClient from "@/components/RequestResponsesManageClient";

type AssignedUserOut = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type RequestOut = {
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
  description: string | null;
  slug: string;
  status: string;
  assigned_user_id?: number | null;
  assigned_user?: AssignedUserOut | null;
};


export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = await params;
  const slug = normalizeParam((p as any)?.slug);
  if (!slug) return {};

  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) return {};

  const id = parseIdFromSlug(slug);
  if (!id) return {};

  const r = await safeFetchRequest(api, id);
  if (!r) return {};

  const city = r.city ? ` в ${r.city}` : "";
  const title = `${r.subject}: репетитор ${r.level}${city} — заявка`;
  const descBase = (r.description || "").trim();
  const description =
    descBase.length > 40
      ? descBase.slice(0, 180).replace(/\s+/g, " ").trim()
      : `Заявка: ${r.subject}, уровень ${r.level}, формат ${r.format}${city}. Откликнитесь и обсудите детали.`;

  const path = `/requests/${slug}`;
  return {
    title,
    description,
    alternates: buildAlternates(path),
    openGraph: {
      type: "article",
      url: path,
      title,
      description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Repetitor18" }],
      locale: "ru_RU",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

function normalizeParam(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return null;
}

// API ждёт int id: "11-..." или "11"
function parseIdFromSlug(slug: string): number | null {
  const m = slug.match(/^(\d+)(?:-|$)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

async function safeFetchRequest(api: string, requestId: number): Promise<RequestOut | null> {
  try {
    const res = await fetch(`${api}/requests/${requestId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const r = (await res.json()) as RequestOut;
    if (!r || typeof r.id !== "number") return null;
    return r;
  } catch {
    return null;
  }
}

function requestStatusLabel(status: string | null | undefined): { text: string; cls: string } {
  const s = (status || "").toLowerCase();

  if (s === "open") return { text: "Открыта", cls: "badge badgeSuccess" };
  if (s === "assigned") return { text: "Исполнитель выбран", cls: "badge badgePrimary" };
  if (s === "closed") return { text: "Закрыта", cls: "badge badgeMuted" };
  if (s === "archived") return { text: "Архив", cls: "badge badgeMuted" };

  if (s === "in_work" || s === "inwork") return { text: "В работе", cls: "badge badgeWarning" };

  return { text: status ? status : "—", cls: "badge badgeMuted" };
}

function assignedLabel(u?: AssignedUserOut | null): string | null {
  if (!u) return null;
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  const un = (u.username || "").trim();
  if (un) return `@${un}`;
  return `user_id=${u.id}`;
}

function lessonWord(n: number): string {
  const nn = Math.abs(n) % 100;
  const n1 = nn % 10;
  if (nn > 10 && nn < 20) return "уроков";
  if (n1 === 1) return "урок";
  if (n1 >= 2 && n1 <= 4) return "урока";
  return "уроков";
}

function requestKindLabel(k: string | null | undefined): string {
  const s = (k || "").toLowerCase();
  if (s === "broker") return "Посредник";
  if (s === "student") return "Ученик";
  return "—";
}

function formatCommission(r: RequestOut): string | null {
  if ((r.request_kind || "").toLowerCase() !== "broker") return null;

  // Новый формат: комиссия как произвольный текст (храним в commission_type, commission_value может быть null)
  const raw = (r.commission_type || "").trim();
  if (raw && !r.commission_value) return raw;

  // Старый формат: число + тип
  const t = r.commission_type;
  const v = r.commission_value;
  if (!t || !v) return null;

  if (t === "lessons") return `${v} ${lessonWord(v)}`;

  const cur = (r.currency || "RUB").toUpperCase();
  if (cur === "KZT") return `${v} ₸`;
  return `${v} ₽`;
}

export default async function RequestPage({
  params,
}: {
  // В Next 16 params может быть Promise
  params: Promise<Record<string, unknown>>;
}) {
  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) {
    return (
      <main className="page">
        <div className="container stack-lg" style={{ maxWidth: 900 }}>
          <h1 className="h1">Заявка</h1>
          <div className="card cardPad">
            <b>Не задан NEXT_PUBLIC_API_BASE</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Укажите адрес API в переменных окружения фронтенда.
            </div>
          </div>
          <a className="btnLink" href="/requests">
            ← Назад к заявкам
          </a>
        </div>
      </main>
    );
  }

  const p = await params;
  const slug = normalizeParam((p as any)?.slug);

  if (!slug) {
    return (
      <main className="page">
        <div className="container stack-lg" style={{ maxWidth: 900 }}>
          <h1 className="h1">Заявка</h1>
          <div className="card cardPad">
            <b>Некорректная ссылка</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Параметр заявки не найден.
            </div>
          </div>
          <a className="btnLink" href="/requests">
            ← Назад к заявкам
          </a>
        </div>
      </main>
    );
  }

  const id = parseIdFromSlug(slug);
  if (!id) {
    return (
      <main className="page">
        <div className="container stack-lg" style={{ maxWidth: 900 }}>
          <h1 className="h1">Заявка</h1>
          <div className="card cardPad">
            <b>Некорректная ссылка</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Не удалось определить id заявки из адреса. Откройте заявку из списка.
            </div>
          </div>
          <a className="btnLink" href="/requests">
            ← Назад к заявкам
          </a>
        </div>
      </main>
    );
  }

  const r = await safeFetchRequest(api, id);
  if (!r) {
    return (
      <main className="page">
        <div className="container stack-lg" style={{ maxWidth: 900 }}>
          <h1 className="h1">Заявка</h1>
          <div className="card cardPad">
            <b>Не найдена</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Возможно, заявка удалена или недоступна.
            </div>
          </div>
          <a className="btnLink" href="/requests">
            ← Назад к заявкам
          </a>
        </div>
      </main>
    );
  }

  const st = requestStatusLabel(r.status);
  const assignee = assignedLabel(r.assigned_user);

  return (
    <main className="page">
      <div className="container stack-lg" style={{ maxWidth: 900 }}>
        <a className="btnLink" href="/requests">
          ← Назад к заявкам
        </a>

        <div className="pageHeader">
          <div className="stack" style={{ gap: 8, minWidth: 0 }}>
            <h1 className="h1">{r.subject}</h1>
            <div className="row">
              <span className={st.cls}>{st.text}</span>
              <span className="badge badgeMuted">🆔 #{r.id}</span>
            </div>
          </div>
        </div>

                <RequestRespondClient
                  requestId={r.id}
                  status={r.status}
                  authorUserId={r.author_user_id}
                  assignedUserId={r.assigned_user_id}
                />

        <RequestResponsesManageClient requestId={r.id} requestStatus={r.status} />

<div className="card cardPad stack" style={{ gap: 10 }}>
          <div className="subtle">
            🎓 Уровень: <b style={{ color: "var(--text)" }}>{r.level || "—"}</b> {" · "}
            💻 Формат: <b style={{ color: "var(--text)" }}>{r.format || "—"}</b>
          </div>

          <div className="subtle">
            📍 Город: <b style={{ color: "var(--text)" }}>{r.city ?? "—"}</b> {" · "}
            💰 Бюджет: <b style={{ color: "var(--text)" }}>{r.budget_text ?? "—"}</b>
            {(() => {
              const c = formatCommission(r);
              if (!c) return null;
              return (
                <>
                  {" · "} 💸 Комиссия: <b style={{ color: "var(--text)" }}>{c}</b>
                </>
              );
            })()}
          </div>

          <div className="subtle">
            🕒 Расписание: <b style={{ color: "var(--text)" }}>{r.schedule_text ?? "—"}</b>
          </div>

          {assignee ? (
            <>
              <div className="divider" />
              <div className="subtle">
                ✅ Исполнитель: <b style={{ color: "var(--text)" }}>{assignee}</b>
              </div>
            </>
          ) : null}

          <div className="divider" />

          <div>
            <b>📝 Описание</b>
            <div className="prose" style={{ marginTop: 8 }}>
              {r.description?.trim() || "—"}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
