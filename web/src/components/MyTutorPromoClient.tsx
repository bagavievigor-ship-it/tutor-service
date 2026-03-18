"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BumpTutorButton from "@/components/BumpTutorButton";
import { apiFetchAuthed, getToken } from "@/lib/api";

export default function MyTutorPromoClient({ api }: { api: string }) {
  const [state, setState] = useState<"unknown" | "no_login" | "no_profile" | "has_profile">("unknown");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setState("no_login");
      return;
    }

    apiFetchAuthed("/tutors/me/exists")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((t: any) => {
        setState(t && t.exists ? "has_profile" : "no_profile");
      })
      .catch(() => setState("no_profile"));
  }, []);

  if (state === "unknown") return null;

  if (state === "no_login") {
    return (
      <div className="card cardPad">
        <div className="subtle">
          Хотите отображаться в списке репетиторов? Войдите и создайте анкету.
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btnPrimary" href="/login">Войти</Link>
          <Link className="btn" href="/tutors">Посмотреть репетиторов</Link>
        </div>
      </div>
    );
  }

  if (state === "no_profile") {
    return (
      <div className="card cardPad">
        <div className="title">Ваш профиль в списке репетиторов</div>
        <div className="subtle" style={{ marginTop: 6 }}>
          Чтобы откликаться и появиться в списке репетиторов — заполните анкету.
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btnPrimary" href="/tutors/me">Создать анкету</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card cardPad row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="title">Ваш профиль в списке репетиторов</div>
        <div className="subtle">Вы можете поднять анкету выше в списке.</div>
      </div>
      <BumpTutorButton api={api} />
    </div>
  );
}
