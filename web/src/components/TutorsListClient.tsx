"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TutorOfferButton from "@/components/TutorOfferButton";
import Avatar from "@/components/Avatar";

export type TutorOut = {
  id: number;
  user_id: number;
  display_name: string;
  bio: string | null;
  subjects: string[] | null;
  levels: string[] | null;
  formats: string[] | null;
  city: string | null;
  price_from: number | null;
  price_to: number | null;
  slug: string;
  seo_title?: string | null;
  seo_description?: string | null;
  bumped_at?: string | null;

  username?: string | null;
  photo_url?: string | null;
};

function priceLabel(t: TutorOut): string | null {
  if (t.price_from == null && t.price_to == null) return null;
  if (t.price_from != null && t.price_to != null) return `${t.price_from}–${t.price_to}`;
  if (t.price_from != null) return `от ${t.price_from}`;
  return `до ${t.price_to}`;
}

function toSearchText(t: TutorOut): string {
  const parts = [
    t.display_name,
    t.city ?? "",
    (t.subjects ?? []).join(" "),
    (t.levels ?? []).join(" "),
    (t.formats ?? []).join(" "),
    t.bio ?? "",
    t.slug ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

function joinFew(items: string[] | null, limit = 3): string | null {
  const xs = (items ?? []).filter(Boolean);
  if (!xs.length) return null;
  const head = xs.slice(0, limit).join(", ");
  return xs.length > limit ? `${head} +${xs.length - limit}` : head;
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

function stripEmptyLines(text: string): string {
  const src = normalizeNewlines(text);
  const lines = src
    .split("\n")
    .map((l) => l.replace(/[\t ]+$/g, ""))
    .filter((l) => l.trim() !== "");
  return lines.join("\n").trim();
}

function truncateNoWordCut(text: string, limit: number): string {
  const src = normalizeNewlines(text).trim();
  if (!src) return "";
  if (src.length <= limit) return src;

  const chunk = src.slice(0, limit + 1);
  const m = chunk.match(/^([\s\S]*)\s+\S*$/);
  const cut = (m?.[1] ?? src.slice(0, limit)).trimEnd();
  const safe = cut.length >= Math.max(1, Math.floor(limit * 0.6)) ? cut : src.slice(0, limit).trimEnd();
  return safe + "…";
}

// Новый компонент для вывода характеристик в виде аккуратных тегов
function MetaTag({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="metaBadge">
      <span className="metaBadgeIcon" aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

export default function TutorsListClient({ items }: { items: TutorOut[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((t) => toSearchText(t).includes(query));
  }, [q, items]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Обновленный блок поиска */}
      <div className="card stack" style={{ padding: "24px" }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div className="stack" style={{ gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: "18px" }}>Поиск репетитора</div>
            <div className="subtle">Имя, предмет, формат, город…</div>
          </div>

          <div className="searchWrapper">
            <svg className="searchIcon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="input inputSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Например: математика онлайн"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card cardPad">
          <div className="subtle" style={{ textAlign: "center", padding: "20px 0" }}>По вашему запросу ничего не найдено.</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {filtered.map((t) => {
            const href = `/tutors/${t.id}-${t.slug}`;
            const price = priceLabel(t);
            const subjects = joinFew(t.subjects, 4);
            const formats = joinFew(t.formats, 4);
            const levels = joinFew(t.levels, 4);
            const bioShort = t.bio ? truncateNoWordCut(stripEmptyLines(t.bio), 220) : "";

            return (
              <div
                key={t.id}
                className="card cardLink"
                style={{ display: "block", cursor: "pointer", padding: "20px" }}
                onClick={() => router.push(href)}
              >
                <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
                  <div style={{ flex: "0 0 auto", marginTop: "4px" }}>
                    <Avatar url={t.photo_url} name={t.display_name} size={56} />
                  </div>

                  <div className="stack" style={{ gap: 12, flex: 1, minWidth: 0 }}>
                    {/* Шапка карточки: Имя и Цена по краям */}
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "18px", color: "var(--text)" }}>{t.display_name}</div>
                        {t.city ? <div className="subtle" style={{ marginTop: 4 }}>📍 {t.city}</div> : null}
                      </div>
                      
                      {price && (
                        <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text)", whiteSpace: "nowrap" }}>
                          {price} ₽/ч
                        </div>
                      )}
                    </div>

                    {/* Теги характеристик */}
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {subjects ? <MetaTag icon="📚" text={subjects} /> : null}
                      {formats ? <MetaTag icon="💻" text={formats} /> : null}
                      {levels ? <MetaTag icon="🎓" text={levels} /> : null}
                    </div>

                    {/* Описание */}
                    {bioShort ? (
                      <div style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--muted-2)", whiteSpace: "pre-wrap" }}>
                        {bioShort}
                      </div>
                    ) : null}

                    {/* Разделитель и Кнопки */}
                    <div className="divider" style={{ marginTop: 8, marginBottom: 4 }} />
                    <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <TutorOfferButton toTutorUserId={t.user_id} tutorName={t.display_name} compact />
                      </div>

                      <Link
                        href={href}
                        className="btn btnPrimary"
                        title="Открыть анкету"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(href);
                        }}
                      >
                        Подробнее
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}