import { NextResponse } from "next/server";

const SITE_URL = "https://app.repetitor18.ru";
const API_URL = "https://api.app.repetitor18.ru";

export async function GET() {
  let tutors: any[] = [];

  try {
    const res = await fetch(`${API_URL}/tutors`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (data?.items) {
      tutors = data.items;
    } else if (Array.isArray(data)) {
      tutors = data;
    }
  } catch (e) {
    tutors = [];
  }

  const now = new Date().toISOString();

  const staticPages = [
    `${SITE_URL}/`,
    `${SITE_URL}/tutors`,
  ];

  const cityPages = [
    "moskva",
    "spb",
    "kazan",
    "ekaterinburg",
    "novosibirsk",
    "sochi",
    "krasnodar",
  ].map((city) => `${SITE_URL}/tutors/${city}`);

  const tutorPages = tutors.map((t) => `${SITE_URL}/tutor/${t.id}`);

  const urls = [...staticPages, ...cityPages, ...tutorPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
 xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

${urls
  .map(
    (url) => `
<url>
  <loc>${url}</loc>
  <lastmod>${now}</lastmod>
  <changefreq>weekly</changefreq>
  <priority>${url === SITE_URL + "/" ? "1.0" : "0.7"}</priority>
</url>`
  )
  .join("")}

</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}