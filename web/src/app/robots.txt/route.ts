export const runtime = "nodejs";

export async function GET() {
  const body = [
    "User-agent: *",
    "Disallow: /me/",
    "Disallow: /login",
    "Disallow: /tutors/me",
    "Disallow: /requests/new",
    "Disallow: /api/",
    "Disallow: /*?*",
    "",
    "Sitemap: https://app.repetitor18.ru/sitemap.xml",
    ""
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
