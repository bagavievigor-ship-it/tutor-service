import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import ModeSwitcher from "@/components/ModeSwitcher";
import Script from "next/script";
import { SITE_ORIGIN, SITE_NAME } from "@/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: "Подбор репетиторов и заявки учеников: анкеты, цены, отклики и чат.",
  alternates: {
    canonical: SITE_ORIGIN,
    languages: {
      ru: SITE_ORIGIN,
      "x-default": SITE_ORIGIN,
    } as any,
  },
  openGraph: {
    type: "website",
    url: SITE_ORIGIN,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: "Подбор репетиторов и заявки учеников: анкеты, цены, отклики и чат.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_NAME }],
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "Подбор репетиторов и заявки учеников: анкеты, цены, отклики и чат.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_ORIGIN,
    inLanguage: "ru",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_ORIGIN}/tutors?query={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/logo.png`,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* WebSite schema + Organization schema */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />

        <AppHeader />
        {children}
        <ModeSwitcher />

        <Script
          id="yandex-metrika"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
              })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

              ym(106942851, "init", {
                webvisor: true,
                clickmap: true,
                accurateTrackBounce: true,
                trackLinks: true
              });
            `,
          }}
        />

        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/106942851" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
      </body>
    </html>
  );
}
