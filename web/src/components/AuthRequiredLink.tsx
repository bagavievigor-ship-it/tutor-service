"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/api";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  /** Например: "создать заявку", "создать анкету", "отправить отклик" */
  actionText?: string;
};

export default function AuthRequiredLink({ href, className, children, actionText }: Props) {
  const [open, setOpen] = useState(false);

  const [isAuthed, setIsAuthed] = useState<boolean>(() => !!getToken());

  useEffect(() => {
    const sync = () => {
      const t = getToken();
      setIsAuthed(!!t);
      if (t) setOpen(false);
    };

    // на случай входа на других вкладках/компонентах
    window.addEventListener("storage", sync);
    window.addEventListener("r18-auth-changed", sync as any);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("r18-auth-changed", sync as any);
    };
  }, []);

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isAuthed) return;
    e.preventDefault();
    setOpen(true);
  }

  return (
    <>
      <a className={className} href={href} onClick={onClick}>
        {children}
      </a>

      {open && !isAuthed ? (
        <div className="card cardPad cardDashed" style={{ marginTop: 10 }}>
          <div className="title">Нужен вход</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            {actionText ? (
              <>Чтобы {actionText}, сначала авторизуйтесь через Telegram. Это занимает 10–15 секунд.</>
            ) : (
              <>Чтобы продолжить, сначала авторизуйтесь через Telegram. Это занимает 10–15 секунд.</>
            )}
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <a className="btn btnPrimary" href="https://app.repetitor18.ru/login">
              Войти сейчас
            </a>
            <button className="btn" type="button" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
