// /opt/repetitor_app_web/src/app/tutors/[idSlug]/page.tsx

import Link from "next/link";
import TutorOfferButton from "@/components/TutorOfferButton";
import CopyTutorProfileButton from "@/components/CopyTutorProfileButton";
import ShareTutorProfileButtons from "@/components/ShareTutorProfileButtons";
import Avatar from "@/components/Avatar";
import type { Metadata } from "next";

import { getCityBySlug, getSubjectBySlug, buildSeo } from "@/seo/catalog";
import { TutorsListingPage } from "../_listing";
import { buildAlternates, canonicalUrl } from "@/seo/site";

type TutorOut = {
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
  telegram_contact?: string | null;
  vk_contact?: string | null;
  slug: string;
  seo_title?: string | null;
  seo_description?: string | null;

  username?: string | null;
  photo_url?: string | null;
};

function normalizeTelegramUrl(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  if (s.startsWith("@")) return `https://t.me/${s.slice(1)}`;
  if (s.startsWith("t.me/") || s.startsWith("telegram.me/")) return `https://${s}`;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://t.me/${s}`;
}

function normalizeVkUrl(input: string): string | null {
  const s0 = (input || "").trim();
  if (!s0) return null;
  const s = s0.startsWith("@") ? s0.slice(1) : s0;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("vk.com/") || s.startsWith("m.vk.com/")) return `https://${s}`;
  return `https://vk.com/${s}`;
}

function normalizeSlug(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function parseIdFromIdSlug(idSlug: unknown): number | null {
  const s = normalizeSlug(idSlug);
  if (!s) return null;
  const m = s.match(/^(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

function parseSlugOnly(idSlug: unknown): string | null {
  const s = normalizeSlug(idSlug);
  if (!s) return null;
  return s;
}

function joinList(items: string[] | null) {
  const xs = (items ?? []).filter(Boolean);
  return xs.length ? xs.join(", ") : null;
}

function priceLabel(t: TutorOut): string | null {
  if (t.price_from == null && t.price_to == null) return null;
  if (t.price_from != null && t.price_to != null) return `${t.price_from}–${t.price_to} ₽/ч`;
  if (t.price_from != null) return `от ${t.price_from} ₽/ч`;
  return `до ${t.price_to} ₽/ч`;
}

function MetaTag({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="metaBadge">
      <span className="metaBadgeIcon" aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

export default async function TutorPublicPage({
  params,
}: {
  params: Promise<{ idSlug: string }>;
}) {
  const p = await params;
  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) {
    return (
      <main className="page">
        <div className="container stack">
          <div className="pageHeader">
            <h1>Репетитор</h1>
            <p className="subtle">Не задан NEXT_PUBLIC_API_BASE.</p>
          </div>
        </div>
      </main>
    );
  }

  const raw = parseSlugOnly((p as any)?.idSlug);
  const id = parseIdFromIdSlug(raw);
  if (!raw) {
    return (
      <main className="page">
        <div className="container stack">
          <div className="pageHeader">
            <h1>Репетитор</h1>
            <p className="subtle">Некорректная ссылка на анкету.</p>
          </div>
        </div>
      </main>
    );
  }

  const city = getCityBySlug(raw);
  const subject = getSubjectBySlug(raw);
  if (city || subject) {
    return TutorsListingPage({
      api,
      variant: city ? "city" : "subject",
      city,
      subject,
      pathname: city ? `/tutors/${city.slug}` : `/tutors/${subject!.slug}`,
    });
  }

  const url = id ? `${api}/tutors/${id}` : `${api}/tutors/by-slug/${encodeURIComponent(raw)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return (
      <main className="page">
        <div className="container stack">
          <div className="pageHeader">
            <h1>Репетитор</h1>
            <p className="subtle">Не удалось загрузить анкету (HTTP {res.status}).</p>
          </div>
        </div>
      </main>
    );
  }

  const t = (await res.json()) as TutorOut;

  const subjects = joinList(t.subjects);
  const levels = joinList(t.levels);
  const formats = joinList(t.formats);
  const price = priceLabel(t);

  const tgUrl = normalizeTelegramUrl(String(t.telegram_contact || ""));
  const vkUrl = normalizeVkUrl(String(t.vk_contact || ""));
  const hasContacts = Boolean(tgUrl || vkUrl);

  return (
    <main className="page">
      <div className="container stack" style={{ gap: 20 }}>
        
        <div>
          <Link href="/tutors" className="btnLink subtle" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>←</span> К списку репетиторов
          </Link>
        </div>

        <div className="card" style={{ padding: "32px 24px" }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 auto" }}>
              <Avatar url={t.photo_url} name={t.display_name} size={96} />
            </div>
            
            <div className="stack" style={{ flex: 1, minWidth: 260, gap: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, lineHeight: 1.1 }}>{t.display_name}</h1>
                  {t.city ? <div className="subtle" style={{ marginTop: 8, fontSize: "15px" }}>📍 {t.city}</div> : null}
                </div>
                
                {price && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {price}
                    </div>
                  </div>
                )}
              </div>

              <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <TutorOfferButton toTutorUserId={t.user_id} tutorName={t.display_name} />
                <CopyTutorProfileButton tutor={t} />
              </div>
            </div>
          </div>
        </div>

        <div className="card stack" style={{ padding: "28px 24px", gap: 20 }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>О преподавателе</h2>
          
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            {subjects ? <MetaTag icon="📚" text={subjects} /> : null}
            {formats ? <MetaTag icon="💻" text={formats} /> : null}
            {levels ? <MetaTag icon="🎓" text={levels} /> : null}
          </div>

          <div className="divider" />

          {t.bio ? (
            <div className="prose" style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--muted-2)", whiteSpace: "pre-wrap" }}>
              {t.bio}
            </div>
          ) : (
            <div className="subtle">Описание не заполнено.</div>
          )}
        </div>

        {hasContacts && (
          <div className="card stack" style={{ padding: "24px", gap: 16 }}>
            <div style={{ fontWeight: 800, fontSize: "18px" }}>Связаться с репетитором напрямую</div>
            <div className="row" style={{ gap: 12, justifyContent: "flex-start" }}>
              {tgUrl ? (
                <a
                  href={tgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Telegram"
                  aria-label="Telegram"
                  className="cardLink"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#229ED9",
                    boxShadow: "0 4px 12px rgba(34, 158, 217, 0.25)",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M9.47 14.59 9.2 18.39c.43 0 .62-.19.84-.41l2.01-1.92 4.17 3.06c.76.42 1.3.2 1.49-.7l2.7-12.68h0c.22-1.03-.37-1.43-1.12-1.16L3.2 10.3c-1 .39-.98.95-.17 1.2l4.63 1.45L18.4 6.6c.51-.33.98-.15.59.18l-8.7 7.81-.82 0Z" fill="#fff" />
                  </svg>
                </a>
              ) : null}

              {vkUrl ? (
                <a
                  href={vkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="ВКонтакте"
                  aria-label="ВКонтакте"
                  className="cardLink"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0077FF",
                    boxShadow: "0 4px 12px rgba(0, 119, 255, 0.25)",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12.53 17.47c-5.42 0-8.51-3.72-8.63-9.9h2.72c.08 4.53 2.09 6.45 3.68 6.85V7.57h2.56v3.91c1.57-.17 3.23-1.95 3.79-3.91h2.56c-.43 2.46-2.23 4.24-3.51 4.97 1.28.59 3.32 2.14 4.1 4.93h-2.82c-.61-1.9-2.14-3.37-4.12-3.57v3.57h-.31Z" fill="#fff" />
                  </svg>
                </a>
              ) : null}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: "20px 24px" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ fontWeight: 800 }}>Поделиться анкетой</div>
            <ShareTutorProfileButtons tutor={t} />
          </div>
        </div>
        
      </div>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ idSlug: string }>;
}): Promise<Metadata> {
  const p = await params;
  const raw = parseSlugOnly((p as any)?.idSlug);
  if (!raw) return {};

  const city = getCityBySlug(raw);
  const subject = getSubjectBySlug(raw);
  if (city || subject) {
    const variant = city ? "city" : "subject";
    const seo = buildSeo(variant, { city, subject });
    const path = city ? `/tutors/${city.slug}` : `/tutors/${subject!.slug}`;
    return {
      title: seo.title,
      description: seo.description,
      alternates: buildAlternates(path),
      openGraph: {
        type: "website",
        url: path,
        title: seo.title,
        description: seo.description,
        images: [{ url: "/og.png", width: 1200, height: 630, alt: "Repetitor18" }],
        locale: "ru_RU",
      },
      twitter: {
        card: "summary_large_image",
        title: seo.title,
        description: seo.description,
        images: ["/og.png"],
      },
    };
  }

  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) return {};

  const id = parseIdFromIdSlug(raw);
  const url = id ? `${api}/tutors/${id}` : `${api}/tutors/by-slug/${encodeURIComponent(raw)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return {};
  const t = (await res.json()) as TutorOut;

  const title = (t.seo_title && t.seo_title.trim()) || `${t.display_name} — репетитор`;
  const description = (t.seo_description && t.seo_description.trim()) || "Анкета репетитора: предметы, формат занятий и стоимость.";

  return {
    title,
    description,
    alternates: buildAlternates(`/tutors/${t.slug || raw}`),
    openGraph: {
      type: "profile",
      url: `/tutors/${t.slug || raw}`,
      title: String(title),
      description: String(description),
      images: [{ url: (t as any).photo_url || "/og.png", width: 1200, height: 630, alt: String(title) }],
      locale: "ru_RU",
    },
    twitter: {
      card: "summary_large_image",
      title: String(title),
      description: String(description),
      images: [(t as any).photo_url || "/og.png"],
    },
  };
}