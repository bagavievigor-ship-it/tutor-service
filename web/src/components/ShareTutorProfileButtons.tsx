import { buildTutorProfileText, buildTutorProfileUrl, type TutorShareOut } from "@/lib/tutorProfileShare";

function enc(v: string) {
  return encodeURIComponent(v);
}

// VK иногда игнорирует обычные '\n'. Пробуем "line separator" (U+2028)
function vkLineBreaks(s: string) {
  return s.replace(/\r?\n/g, "\u2028");
}

export default function ShareTutorProfileButtons({ tutor }: { tutor: TutorShareOut }) {
  const url = buildTutorProfileUrl(tutor);

  // Текст БЕЗ строки "Анкета: ..." — для TG (в text), VK/OK
  const textNoLink = buildTutorProfileText(tutor, { includeLinkLine: false }).trim();

  // Текст С строкой "Анкета: ..." — для WhatsApp/Email (там удобно, чтобы ссылка была в конце)
  const textWithLink = buildTutorProfileText(tutor, { includeLinkLine: true }).trim();

  // ✅ Telegram: url отдельно (чтобы открыл анкету/превью), а text без ссылки (чтобы не было дубля и "ссылки сверху")
  const tgShare = `https://t.me/share/url?url=${enc(url)}&text=${enc(textNoLink)}`;

  // WhatsApp: даём текст со ссылкой в конце
  const waShare = `https://wa.me/?text=${enc(textWithLink)}`;

  // VK: возвращаем comment, переносы пробуем через U+2028 (может склеить — это ограничение VK)
  const vkShare =
    `https://vk.com/share.php?url=${enc(url)}` +
    `&title=${enc(tutor.display_name)}` +
    `&comment=${enc(vkLineBreaks(textNoLink))}`;

  // OK: url отдельно, description без строки "Анкета"
  const okShare =
    `https://connect.ok.ru/offer?url=${enc(url)}` +
    `&title=${enc(tutor.display_name)}` +
    `&description=${enc(textNoLink)}`;

  // Email: body = текст со ссылкой в конце
  const mailShare = `mailto:?subject=${enc(`Анкета репетитора: ${tutor.display_name}`)}&body=${enc(textWithLink)}`;

  const btnBase: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 20px rgba(0,0,0,.10)",
    transition: "transform .08s ease",
  };

  const iconProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  return (
    <div className="row" style={{ gap: 10, justifyContent: "flex-start", flexWrap: "wrap" }}>
      <a
        href={tgShare}
        target="_blank"
        rel="noopener noreferrer"
        title="Поделиться в Telegram"
        aria-label="Поделиться в Telegram"
        style={{ ...btnBase, background: "#229ED9" }}
      >
        <svg {...iconProps}>
          <path
            d="M9.47 14.59 9.2 18.39c.43 0 .62-.19.84-.41l2.01-1.92 4.17 3.06c.76.42 1.3.2 1.49-.7l2.7-12.68h0c.22-1.03-.37-1.43-1.12-1.16L3.2 10.3c-1 .39-.98.95-.17 1.2l4.63 1.45L18.4 6.6c.51-.33.98-.15.59.18l-8.7 7.81-.82 0Z"
            fill="#fff"
          />
        </svg>
      </a>

      <a
        href={waShare}
        target="_blank"
        rel="noopener noreferrer"
        title="Поделиться в WhatsApp"
        aria-label="Поделиться в WhatsApp"
        style={{ ...btnBase, background: "#25D366" }}
      >
        <svg {...iconProps}>
          <path
            d="M12.05 2C6.54 2 2.08 6.46 2.08 11.97c0 1.94.56 3.83 1.61 5.45L2 22l4.71-1.22a9.93 9.93 0 0 0 5.34 1.55h0c5.5 0 9.96-4.46 9.96-9.96C22 6.46 17.54 2 12.05 2Zm5.78 14.48c-.24.68-1.2 1.28-1.93 1.44-.5.11-1.16.2-3.78-.8-3.35-1.28-5.51-4.43-5.68-4.64-.17-.22-1.36-1.81-1.36-3.46 0-1.65.86-2.46 1.16-2.8.3-.35.66-.43.88-.43.22 0 .44 0 .64.01.2.01.47-.07.73.56.26.63.9 2.19.98 2.35.08.16.13.35.03.56-.1.21-.15.35-.3.54-.15.19-.31.42-.44.56-.15.15-.31.32-.13.62.17.3.76 1.26 1.63 2.04 1.12 1 2.07 1.31 2.37 1.46.3.15.48.13.66-.08.18-.2.76-.88.96-1.18.2-.3.4-.24.67-.14.27.1 1.71.81 2 1 .3.19.5.28.57.43.07.16.07.9-.17 1.58Z"
            fill="#fff"
          />
        </svg>
      </a>

      <a
        href={vkShare}
        target="_blank"
        rel="noopener noreferrer"
        title="Поделиться ВКонтакте"
        aria-label="Поделиться ВКонтакте"
        style={{ ...btnBase, background: "#0077FF" }}
      >
        <svg {...iconProps}>
          <path
            d="M12.53 17.47c-5.42 0-8.51-3.72-8.63-9.9h2.72c.08 4.53 2.09 6.45 3.68 6.85V7.57h2.56v3.91c1.57-.17 3.23-1.95 3.79-3.91h2.56c-.43 2.46-2.23 4.24-3.51 4.97 1.28.59 3.32 2.14 4.1 4.93h-2.82c-.61-1.9-2.14-3.37-4.12-3.57v3.57h-.31Z"
            fill="#fff"
          />
        </svg>
      </a>

      <a
        href={okShare}
        target="_blank"
        rel="noopener noreferrer"
        title="Поделиться в Одноклассниках"
        aria-label="Поделиться в Одноклассниках"
        style={{ ...btnBase, background: "#EE8208" }}
      >
        <svg {...iconProps}>
          <path
            d="M12 12.72a4.06 4.06 0 1 0 0-8.12 4.06 4.06 0 0 0 0 8.12Zm0-6.02a1.96 1.96 0 1 1 0 3.92 1.96 1.96 0 0 1 0-3.92Z"
            fill="#fff"
          />
          <path
            d="M16.71 14.64a1.1 1.1 0 0 0-1.54-.15c-.68.52-1.55.82-2.47.82-.92 0-1.79-.3-2.47-.82a1.1 1.1 0 1 0-1.39 1.7 6.24 6.24 0 0 0 2.31 1.13l-1.98 1.97a1.1 1.1 0 0 0 1.55 1.55L12 19.59l1.25 1.25a1.1 1.1 0 0 0 1.55-1.55l-1.98-1.97a6.24 6.24 0 0 0 2.31-1.13c.48-.37.55-1.06.18-1.55Z"
            fill="#fff"
          />
        </svg>
      </a>

      <a href={mailShare} title="Поделиться по почте" aria-label="Поделиться по почте" style={{ ...btnBase, background: "#6B7280" }}>
        <svg {...iconProps}>
          <path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11Zm2.5-.5a.5.5 0 0 0-.5.5v.2l6 4.2 6-4.2v-.2a.5.5 0 0 0-.5-.5h-11Zm11.5 3.14-5.43 3.8a1 1 0 0 1-1.14 0L6 9.14V17.5c0 .28.22.5.5.5h11a.5.5 0 0 0 .5-.5V9.14Z"
            fill="#fff"
          />
        </svg>
      </a>
    </div>
  );
}