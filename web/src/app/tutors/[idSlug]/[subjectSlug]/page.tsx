import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCityBySlug, getSubjectBySlug, buildSeo } from "@/seo/catalog";
import { TutorsListingPage } from "../../_listing";
import { buildAlternates } from "@/seo/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ idSlug: string; subjectSlug: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = getCityBySlug(p.idSlug);
  const subject = getSubjectBySlug(p.subjectSlug);
  if (!city || !subject) return {};

  const seo = buildSeo("city_subject", { city, subject });
  const path = `/tutors/${city.slug}/${subject.slug}`;
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

export default async function TutorsCitySubjectPage({
  params,
}: {
  params: Promise<{ idSlug: string; subjectSlug: string }>;
}) {
  const p = await params;
  const city = getCityBySlug(p.idSlug);
  const subject = getSubjectBySlug(p.subjectSlug);
  if (!city || !subject) return notFound();

  const api = process.env.NEXT_PUBLIC_API_BASE!;
  return TutorsListingPage({
    api,
    variant: "city_subject",
    city,
    subject,
    pathname: `/tutors/${city.slug}/${subject.slug}`,
  });
}
