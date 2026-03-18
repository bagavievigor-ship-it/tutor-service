"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type R18Mode = "student" | "tutor";

function deriveModeFromPath(pathname: string): R18Mode {
  // Если пользователь на страницах каталога репетиторов — логично считать режим "Ученик".
  if (pathname.startsWith("/tutors")) return "student";
  // Если на страницах заявок/откликов/анкеты — режим "Репетитор".
  if (pathname.startsWith("/requests")) return "tutor";
  if (pathname.startsWith("/me/responses")) return "tutor";
  if (pathname.startsWith("/tutors/me")) return "tutor";
  return "student";
}

export default function ModeSwitcher() {
  const router = useRouter();
  const pathname = usePathname() || "/";

  const initial = useMemo<R18Mode>(() => {
    if (typeof window === "undefined") return "student";
    const stored = window.localStorage.getItem("r18_mode") as R18Mode | null;
    return stored === "student" || stored === "tutor" ? stored : deriveModeFromPath(pathname);
  }, [pathname]);

  const [mode, setMode] = useState<R18Mode>(initial);

  useEffect(() => {
    // синхронизация при навигации/первой загрузке
    const stored = window.localStorage.getItem("r18_mode") as R18Mode | null;
    if (stored === "student" || stored === "tutor") {
      setMode(stored);
    } else {
      setMode(deriveModeFromPath(pathname));
    }
  }, [pathname]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "r18_mode") return;
      if (e.newValue === "student" || e.newValue === "tutor") setMode(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Переключатель режима полезен и до авторизации: он просто ведёт в публичные разделы.

  const applyMode = (nextMode: R18Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    try {
      window.localStorage.setItem("r18_mode", nextMode);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event("r18-mode-changed"));

    // Требование: при смене режима — сразу переходим на соответствующую страницу.
    router.push(nextMode === "student" ? "/tutors" : "/requests");
  };

  return (
    <div className="modeSwitcher card">
      <div className="modeSwitcherInner">
        <div className="modeSwitcherTitle">Выберите режим</div>

        <div className="modeSwitcherRow" role="group" aria-label="Режим">
          <button
            type="button"
            className={`modeSwitcherSide ${mode === "student" ? "isActive" : ""}`}
            onClick={() => applyMode("student")}
          >
            Ученик
          </button>

          <button
            type="button"
            className={`modeSwitcherPill ${mode === "tutor" ? "isRight" : ""}`}
            onClick={() => applyMode(mode === "student" ? "tutor" : "student")}
            aria-label="Переключить режим"
          >
            <span className="modeSwitcherThumb" />
          </button>

          <button
            type="button"
            className={`modeSwitcherSide ${mode === "tutor" ? "isActive" : ""}`}
            onClick={() => applyMode("tutor")}
          >
            Репетитор
          </button>
        </div>
      </div>
    </div>
  );
}
