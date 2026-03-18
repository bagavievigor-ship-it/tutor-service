"use client";

import { useState } from "react";

function getToken(): string | null {
  // как у тебя в login/page.tsx
  return localStorage.getItem("r18_token");
}

export default function BumpTutorButton({ api }: { api: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bump = async () => {
    setStatus(null);
    setLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setStatus("Нужно войти в аккаунт");
        return;
      }

      const res = await fetch(`${api}/tutors/me/bump`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      setStatus("Анкета поднята ✅");
      // чтобы увидеть эффект сортировки — перезагрузим страницу каталога
      window.location.reload();
    } catch (e: any) {
      setStatus(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="row" style={{ gap: 10 }}>
      <button onClick={bump} disabled={loading} className="btn btnPrimary">
        {loading ? "Поднимаю…" : "Поднять анкету"}
      </button>

      {status && <span className="subtle">{status}</span>}
    </span>
  );
}
