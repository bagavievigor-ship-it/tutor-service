"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetchAuthed } from "@/lib/api";

type R18Mode = "student" | "tutor";

function deriveModeFromPath(pathname: string): R18Mode {
  if (pathname.startsWith("/tutors")) return "student";
  if (pathname.startsWith("/requests")) return "tutor";
  if (pathname.startsWith("/me/responses")) return "tutor";
  if (pathname.startsWith("/tutors/me")) return "tutor";
  return "student";
}

function NavLink({
  href,
  children,
  badge,
  emphasize,
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
  emphasize?: boolean;
}) {
  return (
    <Link
      className="navLink"
      href={href}
      style={{ position: "relative", fontWeight: emphasize ? 700 : undefined }}
    >
      {children}
      {badge && badge > 0 ? (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -10,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 999,
            background: "crimson",
            color: "white",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--surface)",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function AppHeader() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const pathname = usePathname() || "/";
  const [mode, setMode] = useState<R18Mode>("student");

  useEffect(() => {
    setIsAuthed(!!localStorage.getItem("r18_token"));

    const stored = (localStorage.getItem("r18_mode") as R18Mode | null);
    if (stored === "student" || stored === "tutor") setMode(stored);
    else setMode(deriveModeFromPath(pathname));

    const onStorage = (e: StorageEvent) => {
      if (e.key === "r18_token") setIsAuthed(!!e.newValue);
      if (e.key === "r18_mode" && (e.newValue === "student" || e.newValue === "tutor")) {
        setMode(e.newValue);
      }
    };

    const onAuthChanged = () => setIsAuthed(!!localStorage.getItem("r18_token"));

    window.addEventListener("storage", onStorage);
    window.addEventListener("r18-auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("r18-auth-changed", onAuthChanged);
    };
  }, [pathname]);

  useEffect(() => {
    const handler = () => {
      const stored = (localStorage.getItem("r18_mode") as R18Mode | null);
      if (stored === "student" || stored === "tutor") setMode(stored);
    };
    window.addEventListener("r18-mode-changed", handler);
    return () => window.removeEventListener("r18-mode-changed", handler);
  }, []);

  // Счётчик непрочитанных уведомлений
  useEffect(() => {
    if (!isAuthed) {
      setUnreadCount(0);
      return;
    }

    let alive = true;
    const load = async () => {
      try {
        const res = await apiFetchAuthed("/me/notifications/unread-count");
        if (!res.ok) return;
        const data = await res.json();
        const c = typeof data?.count === "number" ? data.count : 0;
        if (alive) setUnreadCount(c);
      } catch {
        // молчим
      }
    };

    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isAuthed]);

  // Быстро обновлять счётчик при пометке уведомлений как прочитанных
  useEffect(() => {
    if (!isAuthed) return;
    const handler = async () => {
      try {
        const res = await apiFetchAuthed("/me/notifications/unread-count");
        if (!res.ok) return;
        const data = await res.json();
        const c = typeof data?.count === "number" ? data.count : 0;
        setUnreadCount(c);
      } catch {
        // ignore
      }
    };
    window.addEventListener("r18-notifications-changed", handler);
    return () => window.removeEventListener("r18-notifications-changed", handler);
  }, [isAuthed]);

  return (
    <header className="appHeader">
      <div className="container headerInner">
        <div className="brandRow">
          <Link className="brand" href="/">
            Repetitor18
          </Link>
          <div className="headerRight">
            {isAuthed ? (
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn btnLink headerLogin" href="/me/account" title="Аккаунт">
                  <span className="headerLoginIcon">👤</span>
                  <span className="hideMobile">Аккаунт</span>
                </Link>
              </div>
            ) : (
              <Link className="btn btnLink headerLogin" href="/login" title="Войти">
                <span className="headerLoginIcon">🔐</span>
                <span className="hideMobile">Войти</span>
              </Link>
            )}
          </div>
        </div>

        <nav className="nav">
          {/* Публичные разделы показываем сразу (до авторизации) */}
          {mode !== "student" ? <NavLink href="/requests" emphasize>Заявки</NavLink> : null}
          {mode !== "tutor" ? <NavLink href="/tutors" emphasize>Репетиторы</NavLink> : null}

          {/* Персональные разделы — только после входа */}
          {isAuthed ? (
            <>
              {mode !== "tutor" ? <NavLink href="/me/requests">Мои заявки</NavLink> : null}
              {mode !== "student" ? <NavLink href="/me/responses">Мои отклики</NavLink> : null}
              <NavLink href="/me/threads">Чаты</NavLink>
              <NavLink href="/me/notifications" badge={unreadCount}>Уведомления</NavLink>
              {mode !== "student" ? <NavLink href="/tutors/me">Моя анкета</NavLink> : null}
            </>
          ) : null}
        </nav>
      </div>

    </header>
  );
}