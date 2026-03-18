"use client";

import { useMemo, useState } from "react";
import { defaultTutorProfileUrl, formatTutorProfileText, type TutorProfileForShare } from "@/lib/formatTutorProfileText";

function openShareUrl(url: string) {
  // popup/window open might be blocked; fall back to normal navigation
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = url;
  }
}

export default function ShareTutorProfileBlock({ tutor }: { tutor: TutorProfileForShare }) {
  const [copiedLink, setCopiedLink] = useState(false);

  const profileUrl = useMemo(() => {
    return typeof window !== "undefined" ? window.location.href : defaultTutorProfileUrl(tutor);
  }, [tutor]);

  const text = useMemo(() => formatTutorProfileText(tutor, profileUrl), [tutor, profileUrl]);

  const enc = (s: string) => encodeURIComponent(s);

  const shareNative = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: tutor.display_name,
          text,
          url: profileUrl,
        });
      }
    } catch {
      // user cancelled or not supported — ignore
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1200);
    } catch {
      const el = document.createElement("textarea");
      el.value = profileUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1200);
    }
  };

  const tgShare = () => openShareUrl(`https://t.me/share/url?url=${enc(profileUrl)}&text=${enc(text)}`);
  const waShare = () => openShareUrl(`https://wa.me/?text=${enc(text + "\n\n" + profileUrl)}`);
  const vkShare = () =>
    openShareUrl(`https://vk.com/share.php?url=${enc(profileUrl)}&title=${enc(tutor.display_name)}&description=${enc(text)}`);

  return (
    <div className="stack" style={{ gap: 8, marginTop: 10 }}>
      <div style={{ fontWeight: 800, marginTop: 6 }}>Поделиться анкетой</div>

      <div className="row" style={{ gap: 10, justifyContent: "flex-start", flexWrap: "wrap" }}>
        {"share" in navigator ? (
          <button className="btn" onClick={shareNative} title="Системное меню «Поделиться»">
            📲 Поделиться
          </button>
        ) : null}

        <button className="btn" onClick={tgShare} title="Поделиться в Telegram">
          ✈️ Telegram
        </button>

        <button className="btn" onClick={waShare} title="Поделиться в WhatsApp">
          💬 WhatsApp
        </button>

        <button className="btn" onClick={vkShare} title="Поделиться во ВКонтакте">
          🟦 ВК
        </button>

        <button className="btn" onClick={copyLink} title="Скопировать ссылку на анкету">
          {copiedLink ? "Ссылка скопирована" : "🔗 Скопировать ссылку"}
        </button>
      </div>

      <div className="subtle" style={{ fontSize: 12 }}>
        Текст будет отправлен форматированно (как в «Копировать анкету»).
      </div>
    </div>
  );
}
