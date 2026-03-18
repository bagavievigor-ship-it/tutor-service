import RequestsListClient, { type RequestOut } from "@/components/RequestsListClient";
import AuthRequiredLink from "@/components/AuthRequiredLink";
import type { Metadata } from "next";
import { buildAlternates, canonicalUrl } from "@/seo/site";

const PAGE_PATH = "/requests";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Заявки на репетитора";
  const description = "Актуальные заявки учеников и посредников: предмет, формат, бюджет и детали. Оставьте заявку и получайте отклики.";
  return {
    title,
    description,
    alternates: buildAlternates(PAGE_PATH),
    openGraph: {
      type: "website",
      url: PAGE_PATH,
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

function faqJsonLd() {
  const items = [
    {
      q: "Кто может создавать заявки?",
      a: "Заявку может создать ученик или посредник. Важно указать предмет, уровень, формат занятий и пожелания по бюджету и расписанию.",
    },
    {
      q: "Как быстро приходят отклики?",
      a: "Скорость зависит от предмета и детализации заявки. Чем понятнее цель и условия, тем выше шанс получить отклики в ближайшее время.",
    },
    {
      q: "Что написать в описании заявки?",
      a: "Цель (оценки/экзамен/олимпиада), текущий уровень, сроки, формат (онлайн/очно), удобное время и любые важные нюансы. Это помогает репетитору предложить план.",
    },
    {
      q: "Можно ли закрыть заявку?",
      a: "Да. Когда исполнитель выбран или задача решена, заявку можно закрыть — так вы не будете получать новые отклики.",
    },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: canonicalUrl(PAGE_PATH),
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

export default async function RequestsPage() {
  const api = process.env.NEXT_PUBLIC_API_BASE;

  if (!api) {
    return (
      <main className="page">
        <div className="container stack-lg">
          <div className="pageHeader">
            <div className="stack" style={{ gap: 6 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                Заявки
              </h1>
            </div>
          </div>
          <div className="card cardPad">
            <b>Не задан NEXT_PUBLIC_API_BASE</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Укажите адрес API в переменных окружения фронтенда.
            </div>
          </div>
        </div>
      </main>
    );
  }

  const res = await fetch(`${api}/requests`, { next: { revalidate: 30 } });

  if (!res.ok) {
    return (
      <main className="page">
        <div className="container stack-lg">
          <div className="pageHeader">
            <div className="stack" style={{ gap: 6 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                Заявки
              </h1>
            </div>
          </div>
          <div className="card cardPad">
            <b>Ошибка загрузки</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Код ответа: {res.status}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const items: RequestOut[] = await res.json();

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="pageHeader">
          <div className="stack" style={{ gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Заявки
            </h1>
            <div className="subtle">Актуальные заявки учеников и посредников</div>
          </div>

          <AuthRequiredLink className="btn btnPrimary" href="/requests/new" actionText="создать заявку">
            + Создать заявку
          </AuthRequiredLink>
        </div>

        {/* FAQ schema */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

        {items.length === 0 ? (
          <div className="card cardPad">
            <b>Пока пусто</b>
            <div className="subtle" style={{ marginTop: 8 }}>
              Здесь будут заявки учеников и посредников.
            </div>
            <div style={{ marginTop: 12 }}>
              <AuthRequiredLink className="btn btnPrimary" href="/requests/new" actionText="создать заявку">
                Создать заявку
              </AuthRequiredLink>
            </div>
          </div>
        ) : (
          <RequestsListClient items={items} />
        )}

        {/* Визуальный FAQ */}
        <section className="card cardPad" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Вопросы и ответы</h2>
          <div className="stack" style={{ gap: 10 }}>
            {[
              {
                q: "Кто может создавать заявки?",
                a: "Заявку может создать ученик или посредник. Важно указать предмет, уровень, формат занятий и пожелания по бюджету и расписанию.",
              },
              {
                q: "Как быстро приходят отклики?",
                a: "Скорость зависит от предмета и детализации заявки. Чем понятнее цель и условия, тем выше шанс получить отклики в ближайшее время.",
              },
              {
                q: "Что написать в описании заявки?",
                a: "Цель (оценки/экзамен/олимпиада), текущий уровень, сроки, формат (онлайн/очно), удобное время и любые важные нюансы. Это помогает репетитору предложить план.",
              },
              {
                q: "Можно ли закрыть заявку?",
                a: "Да. Когда исполнитель выбран или задача решена, заявку можно закрыть — так вы не будете получать новые отклики.",
              },
            ].map((it, i) => (
              <details key={i} className="card" style={{ padding: 12 }}>
                <summary style={{ fontWeight: 800, cursor: "pointer" }}>{it.q}</summary>
                <div className="subtle" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                  {it.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
