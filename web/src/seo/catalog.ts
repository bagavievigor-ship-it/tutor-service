import cities from "./cities.json";
import subjects from "./subjects.json";
import templates from "./templates.json";

export type CityDef = {
  slug: string;
  name: string;
  prepositional: string;
  match: string[];
};

export type SubjectDef = {
  slug: string;
  dative: string;
  match: string[];
};

export type SeoVariant = "base" | "subject" | "city" | "city_subject";

export function getCityBySlug(slug: string): CityDef | null {
  return ((cities as any) as CityDef[]).find((c) => c.slug === slug) ?? null;
}

export function getSubjectBySlug(slug: string): SubjectDef | null {
  return ((subjects as any) as SubjectDef[]).find((s) => s.slug === slug) ?? null;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => vars[key] ?? "");
}

export function buildSeo(
  variant: SeoVariant,
  opts: { city?: CityDef | null; subject?: SubjectDef | null }
): { title: string; description: string; h1: string; intro: string; emptyText?: string } {
  const brand = (templates as any).brand as string;

  const vars: Record<string, string> = {
    brand,
    city_name: opts.city?.name ?? "",
    city_prepositional: opts.city?.prepositional ?? "",
    subject_dative: opts.subject?.dative ?? "",
  };

  const t = templates as any;
  const title = fill(t.title[variant], vars);
  const description = fill(t.description[variant], vars);
  const h1 = fill(t.h1[variant], vars);
  const intro = fill(t.intro[variant], vars);

  let emptyText: string | undefined;
  if (variant !== "base") {
    const emptyTpl = t.empty[variant];
    if (typeof emptyTpl === "string") emptyText = fill(emptyTpl, vars);
  }

  return { title, description, h1, intro, emptyText };
}


export type FaqItem = { q: string; a: string };

export function buildFaq(
  variant: SeoVariant,
  opts: { city?: CityDef | null; subject?: SubjectDef | null }
): { title: string; items: FaqItem[] } {
  const brand = (templates as any).brand as string;

  const vars: Record<string, string> = {
    brand,
    city_name: opts.city?.name ?? "",
    city_prepositional: opts.city?.prepositional ?? "",
    subject_dative: opts.subject?.dative ?? "",
  };

  const t = templates as any;
  const title = (t.faq_title as string) ?? "FAQ";
  const raw = (t.faq && t.faq[variant]) ? (t.faq[variant] as any[]) : [];
  const items: FaqItem[] = raw
    .filter(Boolean)
    .map((x) => ({ q: fill(String(x.q ?? ""), vars), a: fill(String(x.a ?? ""), vars) }))
    .filter((x) => x.q && x.a);

  return { title, items };
}


export function listAllCitySlugs(): string[] {
  return ((cities as any) as CityDef[]).map((c) => c.slug);
}

export function listAllSubjectSlugs(): string[] {
  return ((subjects as any) as SubjectDef[]).map((s) => s.slug);
}
