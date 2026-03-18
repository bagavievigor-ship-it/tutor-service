"use client";

import { useEffect } from "react";

export default function ScrollToHash() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    if (!hash) return;

    // ждём отрисовку (ResponsesPanel может быть ниже)
    const id = hash.replace("#", "");
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);

    return () => clearTimeout(t);
  }, []);

  return null;
}
