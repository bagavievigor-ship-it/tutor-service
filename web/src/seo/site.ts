export const SITE_ORIGIN = "https://app.repetitor18.ru";
export const SITE_NAME = "Repetitor18";

export function canonicalUrl(pathname: string): string {
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return `${SITE_ORIGIN}${pathname}`;
}

export function buildAlternates(pathname: string) {
  const url = canonicalUrl(pathname);
  // hreflang: сайт на русском, но добавляем x-default для корректности
  return {
    canonical: url,
    languages: {
      ru: url,
      "x-default": url,
    } as any,
  };
}
