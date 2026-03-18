export type TutorShareOut = {
  id: number;
  slug: string;
  display_name: string;
  bio: string | null;
  subjects: string[] | null;
  levels: string[] | null;
  formats: string[] | null;
  city: string | null;
  price_from: number | null;
  price_to: number | null;
};

function join(items: string[] | null): string {
  const xs = (items ?? []).filter(Boolean);
  return xs.join(", ");
}

function priceLine(t: TutorShareOut): string | null {
  if (t.price_from == null && t.price_to == null) return null;
  if (t.price_from != null && t.price_to != null) return `Цена: ${t.price_from}–${t.price_to}`;
  if (t.price_from != null) return `Цена от: ${t.price_from}`;
  return `Цена до: ${t.price_to}`;
}

export function buildTutorProfileUrl(t: Pick<TutorShareOut, "id" | "slug">): string {
  return `https://app.repetitor18.ru/tutors/${t.id}-${t.slug}`;
}

/**
 * Форматирование такое же, как в кнопке "Копировать анкету".
 */
export function buildTutorProfileText(
  t: TutorShareOut,
  opts?: { includeLinkLine?: boolean }
): string {
  const includeLinkLine = opts?.includeLinkLine ?? true;
  const lines: string[] = [];

  lines.push(`👤 ${t.display_name}`);

  if (t.city) lines.push(`📍 Город: ${t.city}`);

  const subj = join(t.subjects);
  if (subj) lines.push(`📘 Предметы: ${subj}`);

  const levels = join(t.levels);
  if (levels) lines.push(`🎓 Уровни: ${levels}`);

  const formats = join(t.formats);
  if (formats) lines.push(`💻 Формат: ${formats}`);

  const price = priceLine(t);
  if (price) lines.push(`💰 ${price}`);

  lines.push("");
  if (t.bio) {
    lines.push("📝 О себе:");
    lines.push(t.bio);
    lines.push("");
  }

  if (includeLinkLine) {
    lines.push(`🔗 Анкета: ${buildTutorProfileUrl(t)}`);
  }

  return lines.join("\n");
}
