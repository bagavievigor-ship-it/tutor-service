"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    __tgAuthCb?: (user: any) => void;
  }
}

type Props = {
  onAuth: (user: Record<string, any>) => void;
  buttonSize?: "large" | "medium" | "small";
  cornerRadius?: number;
  showUserPhoto?: boolean;
  lang?: "ru" | "en";
};

export default function TelegramLoginWidget({
  onAuth,
  buttonSize = "large",
  cornerRadius = 10,
  showUserPhoto = true,
  lang = "ru",
}: Props) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"init" | "loading" | "ready" | "error">("init");

  useEffect(() => {
    console.log("[TG] Widget effect. botUsername =", botUsername);

    if (!botUsername) {
      console.error("[TG] NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not set");
      setStatus("error");
      return;
    }

    const container = containerRef.current;
    if (!container) {
      console.error("[TG] containerRef.current is null");
      setStatus("error");
      return;
    }

    setStatus("loading");

    // Глобальный колбэк
    window.__tgAuthCb = (user: any) => {
      console.log("[TG] Auth callback fired:", user);
      onAuth(user);
    };

    // чистим контейнер на каждый рендер эффекта
    container.innerHTML = "";

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";

    s.setAttribute("data-telegram-login", botUsername); // без @
    s.setAttribute("data-size", buttonSize);
    s.setAttribute("data-radius", String(cornerRadius));
    s.setAttribute("data-userpic", showUserPhoto ? "true" : "false");
    s.setAttribute("data-lang", lang);
    s.setAttribute("data-onauth", "window.__tgAuthCb && window.__tgAuthCb(user)");

    s.onload = () => {
      console.log("[TG] Script loaded, widget should render");
      setStatus("ready");
    };

    s.onerror = () => {
      console.error("[TG] Failed to load telegram widget script");
      setStatus("error");
    };

    container.appendChild(s);

    // cleanup: если компонент размонтируется — чистим
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [botUsername, buttonSize, cornerRadius, showUserPhoto, lang, onAuth]);

  return (
    <div>
      <div ref={containerRef} />

      <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
        {status === "loading" && "Загружаю Telegram кнопку…"}
        {status === "ready" && "Если кнопка не видна — обнови страницу Ctrl+F5."}
        {status === "error" && (
          <span style={{ color: "crimson" }}>
            Не удалось отрендерить Telegram Login Widget. Проверь DevTools → Console/Network.
          </span>
        )}
      </div>
    </div>
  );
}
