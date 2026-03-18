import TutorsListClient, { TutorOut } from "@/components/TutorsListClient";
import MyTutorPromoClient from "@/components/MyTutorPromoClient";
import type { Metadata } from "next";

import { buildSeo } from "@/seo/catalog";
import { buildAlternates } from "@/seo/site";

const SITE_URL = "https://app.repetitor18.ru";
const PATH = "/tutors";

export async function generateMetadata(): Promise<Metadata> {
  const seo = buildSeo("base", {});

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      ...buildAlternates(PATH),
      canonical: `${SITE_URL}${PATH}`,
    },
    openGraph: {
      type: "website",
      url: PATH,
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

export default async function TutorsPage() {
  const api = process.env.NEXT_PUBLIC_API_BASE!;
  const res = await fetch(`${api}/tutors`, { next: { revalidate: 60 } });

  if (!res.ok) {
    return (
      <main className="page">
        <div className="container stack">
          <div className="pageHeader">
            <div className="stack" style={{ gap: 6 }}>
              <h1 style={{ margin: 0 }}>Наши репетиторы</h1>
              <p className="subtle">Ошибка загрузки: {res.status}</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const items: TutorOut[] = await res.json();
  const seo = buildSeo("base", {});

  // -------- STRUCTURED DATA --------

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Каталог репетиторов",
    url: `${SITE_URL}${PATH}`,
    numberOfItems: items.length,
    itemListElement: items.map((tutor, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/tutor/${tutor.id}`,
      item: {
        "@type": "Person",
        name: tutor.display_name,
        description: tutor.bio || "Репетитор",
        url: `${SITE_URL}/tutor/${tutor.id}`,
        jobTitle: "Репетитор",
        worksFor: {
          "@type": "EducationalOrganization",
          name: "Repetitor18",
        },
      },
    })),
  };

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ margin: 0 }}>{seo.h1}</h1>
            <p className="subtle">{seo.intro}</p>
          </div>
        </div>

        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />

        {/* promo */}
        <MyTutorPromoClient api={api} />

        <TutorsListClient items={items} />
      </div>
    </main>
  );
}