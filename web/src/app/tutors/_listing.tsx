import TutorsListClient, { TutorOut } from "@/components/TutorsListClient";
import MyTutorPromoClient from "@/components/MyTutorPromoClient";
import { CityDef, SubjectDef, buildSeo, buildFaq, SeoVariant } from "@/seo/catalog";
import { buildSeoText } from "@/seo/seoText";
import { canonicalUrl } from "@/seo/site";

import cities from "@/seo/cities.json";
import subjects from "@/seo/subjects.json";

function normalizeStr(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      // normalize russian letters
      .replace(/ё/g, "е")
      // strip common city prefixes
      .replace(/\bг\.?\s*/g, "")
      .replace(/\bгород\s+/g, "")
      // normalize separators
      .replace(/[–—]/g, "-")
      // collapse spaces
      .replace(/\s+/g, " ")
  );
}

function matchOne(value: string | null | undefined, variants: string[]): boolean {
  if (!value) return false;

  // City field can be "Москва, Екатеринбург" or "Самарская область" etc.
  const parts = String(value)
    .split(/[,/;|]+/g)
    .map((p) => normalizeStr(p))
    .filter(Boolean);

  const vv = variants.map((x) => normalizeStr(x)).filter(Boolean);
  if (!parts.length || !vv.length) return false;

  // exact match on any part
  if (parts.some((p) => vv.includes(p))) return true;

  // fallback: substring match (handles "нижний новгород" vs "г. нижний новгород")
  return parts.some((p) => vv.some((v) => p.includes(v) || v.includes(p)));
}

function matchAny(values: string[] | null | undefined, variants: string[]): boolean {
  const xs = (values ?? []).filter(Boolean);
  if (!xs.length) return false;

  const normValues = xs.map((x) => normalizeStr(x));
  const normVariants = variants.map((v) => normalizeStr(v)).filter(Boolean);
  if (!normVariants.length) return false;

  // 1) exact match first
  const set = new Set(normValues);
  if (normVariants.some((v) => set.has(v))) return true;

  // 2) fuzzy contains match:
  // - helps when tutor has "Биология 5-11класс" and variant is "биология"
  // - for very short variants (<=3), require exact match to avoid false positives
  return normVariants.some((v) => {
    if (v.length <= 3) return false;
    return normValues.some((x) => x.includes(v));
  });
}

export async function fetchAllTutors(api: string): Promise<TutorOut[]> {
  const res = await fetch(`${api}/tutors`, {
    // PageSpeed: небольшая кэш-пауза вместо no-store
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return (await res.json()) as TutorOut[];
}

export function filterTutors(
  items: TutorOut[],
  opts: { city?: CityDef | null; subject?: SubjectDef | null }
): TutorOut[] {
  return items.filter((t) => {
    const okCity = opts.city ? matchOne((t as any).city, opts.city.match) : true;
    const okSubject = opts.subject ? matchAny((t as any).subjects, opts.subject.match) : true;
    return okCity && okSubject;
  });
}

function buildBreadcrumbs(opts: { city?: CityDef | null; subject?: SubjectDef | null }): { name: string; href: string }[] {
  const crumbs: { name: string; href: string }[] = [{ name: "Репетиторы", href: "/tutors" }];

  if (opts.city) {
    crumbs.push({ name: `Репетиторы в ${opts.city.prepositional}`, href: `/tutors/${opts.city.slug}` });
  }

  if (opts.subject) {
    const href = opts.city ? `/tutors/${opts.city.slug}/${opts.subject.slug}` : `/tutors/${opts.subject.slug}`;
    crumbs.push({ name: `Репетиторы по ${opts.subject.dative}`, href });
  }

  return crumbs;
}

function breadcrumbJsonLd(crumbs: { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: canonicalUrl(c.href),
    })),
  };
}

function itemListJsonLd(items: TutorOut[], listUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: items.length,
    url: canonicalUrl(listUrl),
    itemListElement: items.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: canonicalUrl(`/tutors/${(t as any).slug ?? (t as any).id ?? ""}`),
      name: (t as any).display_name ?? "Репетитор",
    })),
  };
}

function faqPageJsonLd(faq: { title?: string; items: { q: string; a: string }[] }, pagePathname: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: canonicalUrl(pagePathname),
    mainEntity: faq.items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.a,
      },
    })),
  };
}

/** --- Перелинковка: похожие города / предметы (детерминированная выборка) --- */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stablePick<T>(arr: T[], seedKey: string, k: number, filterFn?: (x: T) => boolean): T[] {
  const xs = (filterFn ? arr.filter(filterFn) : arr).slice();
  if (!xs.length) return [];
  const seed = hashSeed(seedKey);
  const out: T[] = [];
  const used = new Set<number>();
  let x = seed || 1;

  while (out.length < Math.min(k, xs.length)) {
    x = (Math.imul(1103515245, x) + 12345) >>> 0;
    const idx = x % xs.length;
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(xs[idx]);
  }
  return out;
}

function RelatedLinks(props: { variant: SeoVariant; city?: CityDef | null; subject?: SubjectDef | null }) {
  const { variant, city, subject } = props;

  const cityList = (cities as any) as CityDef[];
  const subjectList = (subjects as any) as SubjectDef[];

  const key = `${variant}|${city?.slug ?? ""}|${subject?.slug ?? ""}`;

  const topCities = stablePick(
    cityList,
    key + "|cities",
    10,
    (c) => !city || (c as any).slug !== city.slug
  );

  const topSubjects = stablePick(
    subjectList,
    key + "|subjects",
    10,
    (s) => !subject || (s as any).slug !== subject.slug
  );

  // Собираем блоки “умнее” под конкретную страницу
  const blocks: { title: string; links: { href: string; name: string }[] }[] = [];

  if (variant === "base") {
    blocks.push({
      title: "Популярные предметы",
      links: topSubjects.slice(0, 10).map((s) => ({ href: `/tutors/${(s as any).slug}`, name: `Репетиторы по ${(s as any).dative}` })),
    });
    blocks.push({
      title: "Популярные города",
      links: topCities.slice(0, 10).map((c) => ({ href: `/tutors/${(c as any).slug}`, name: `Репетиторы в ${(c as any).prepositional}` })),
    });
  } else if (variant === "city" && city) {
    blocks.push({
      title: `Репетиторы по предметам в ${city.prepositional}`,
      links: topSubjects.slice(0, 10).map((s) => ({
        href: `/tutors/${city.slug}/${(s as any).slug}`,
        name: `По ${(s as any).dative}`,
      })),
    });
    blocks.push({
      title: "Другие города",
      links: topCities.slice(0, 10).map((c) => ({ href: `/tutors/${(c as any).slug}`, name: (c as any).name })),
    });
  } else if (variant === "subject" && subject) {
    blocks.push({
      title: `Города, где ищут репетиторов по ${subject.dative}`,
      links: topCities.slice(0, 10).map((c) => ({
        href: `/tutors/${(c as any).slug}/${subject.slug}`,
        name: (c as any).name,
      })),
    });
    blocks.push({
      title: "Похожие предметы",
      links: topSubjects.slice(0, 10).map((s) => ({ href: `/tutors/${(s as any).slug}`, name: `По ${(s as any).dative}` })),
    });
  } else if (variant === "city_subject" && city && subject) {
    blocks.push({
      title: `Другие предметы в ${city.prepositional}`,
      links: topSubjects.slice(0, 10).map((s) => ({
        href: `/tutors/${city.slug}/${(s as any).slug}`,
        name: `По ${(s as any).dative}`,
      })),
    });
    blocks.push({
      title: `Другие города по ${subject.dative}`,
      links: topCities.slice(0, 10).map((c) => ({
        href: `/tutors/${(c as any).slug}/${subject.slug}`,
        name: (c as any).name,
      })),
    });
  }

  if (!blocks.length) return null;

  return (
    <section className="card cardPad" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>Похожие разделы</h2>
      <div className="stack" style={{ gap: 14 }}>
        {blocks.map((b, bi) => (
          <div key={bi} className="stack" style={{ gap: 8 }}>
            <div style={{ fontWeight: 800 }}>{b.title}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {b.links.map((l) => (
                <a key={l.href} className="badge" href={l.href} style={{ textDecoration: "none" }}>
                  {l.name}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function TutorsListingPage(props: {
  api: string;
  variant: SeoVariant;
  city?: CityDef | null;
  subject?: SubjectDef | null;
  pathname: string;
}) {
  const { api, variant, city, subject, pathname } = props;
  const seo = buildSeo(variant, { city, subject });

  const all = await fetchAllTutors(api);
  const filtered = filterTutors(all, { city, subject });

  // SEO: avoid thin pages — if nothing found, show helpful text + catalog preview.
  const allForFallback = all.slice(0, 24);

  const crumbs = buildBreadcrumbs({ city, subject });

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <div className="stack" style={{ gap: 6 }}>
            <nav aria-label="breadcrumb" className="subtle">
              {crumbs.map((c, idx, arr) => (
                <span key={c.href}>
                  <a href={c.href}>{c.name}</a>
                  {idx < arr.length - 1 ? <span> · </span> : null}
                </span>
              ))}
            </nav>

            <h1 style={{ margin: 0 }}>{seo.h1}</h1>
            <p className="subtle">{seo.intro}</p>
          </div>
        </div>

        {/* structured data (Breadcrumbs + ItemList + FAQ schema) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListJsonLd(filtered.length > 0 ? filtered : allForFallback, pathname)),
          }}
        />
        {(() => {
          const faq = buildFaq(variant, { city, subject });
          if (!faq.items.length) return null;
          return (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd(faq, pathname)) }}
            />
          );
        })()}

        {/* promo */}
        <MyTutorPromoClient api={api} />

        {filtered.length > 0 ? (
          <>
            <TutorsListClient items={filtered} />

            <div className="card cardPad" style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="stack" style={{ gap: 4 }}>
                  <div style={{ fontWeight: 800 }}>Нужен другой вариант?</div>
                  <div className="subtle">Посмотрите весь список репетиторов — там есть ещё предметы и города.</div>
                </div>
                <a className="btn btnPrimary" href="/tutors">
                  Смотреть всех репетиторов
                </a>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card cardPad">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Пока пусто</div>
              <div className="subtle">{seo.emptyText ?? "Репетиторов пока не нашлось."}</div>
              <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: "wrap" }}>
                <a className="btn btnPrimary" href="/tutors">
                  Смотреть всех репетиторов
                </a>
              </div>
            </div>

            <div className="pageHeader" style={{ marginTop: 18 }}>
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ margin: 0 }}>Другие репетиторы</h2>
                <p className="subtle">Возможно, вам подойдут занятия онлайн или другой город.</p>
              </div>
            </div>

            <TutorsListClient items={allForFallback} />
          </>
        )}

        {/* FAQ (визуальный блок) */}
        {(() => {
          const faq = buildFaq(variant, { city, subject });
          if (!faq.items.length) return null;
          return (
            <section className="card cardPad" style={{ marginTop: 18 }}>
              <h2 style={{ marginTop: 0 }}>{faq.title}</h2>
              <div className="stack" style={{ gap: 10 }}>
                {faq.items.map((it, i) => (
                  <details key={i} className="card" style={{ padding: 12 }}>
                    <summary style={{ fontWeight: 800, cursor: "pointer" }}>{it.q}</summary>
                    <div className="subtle" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {it.a}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Перелинковка */}
        <RelatedLinks variant={variant} city={city} subject={subject} />

        {/* SEO-текст 400–600 слов */}
        {(() => {
          const st = buildSeoText(variant, { city, subject });
          if (!st) return null;
          return (
            <section className="card cardPad" style={{ marginTop: 18 }}>
              <h2 style={{ marginTop: 0 }}>{st.title}</h2>
              <div className="subtle" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {st.text}
              </div>
            </section>
          );
        })()}
      </div>
    </main>
  );
}
