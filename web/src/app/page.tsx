"use client";

import { useCallback, useEffect, useState } from "react";
import AuthRequiredLink from "@/components/AuthRequiredLink";

type MeOut = {
  id: number;
  telegram_id: number | null | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  created_at: string;
};

function getToken(): string | null {
  return localStorage.getItem("r18_token");
}

export default function Home() {

  const api = process.env.NEXT_PUBLIC_API_BASE!;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeOut | null>(null);

  const isAuthed = !!token;

  const loadMe = useCallback(
    async (t: string) => {
      const res = await fetch(`${api}/me`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });

      if (!res.ok) return;
      const data: MeOut = await res.json();
      setMe(data);
    },
    [api]
  );

  // При загрузке главной:
  // - читаем localStorage токен
  // - синхронизируем cookie (SSR)
  // - подтягиваем профиль для приветствия
  useEffect(() => {
    const t = getToken();
    if (!t) return;

    setToken(t);

    (async () => {
      try {
        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        });
        await loadMe(t);
      } catch {
        // молчим
      }
    })();
  }, [loadMe]);

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <h1>Repetitor18</h1>
          <p className="subtle">
            Площадка для быстрого подбора репетитора: ученики и посредники размещают заявки, а репетиторы откликаются и берут в работу.
          </p>
        </div>

        {/* До входа показываем общий призыв авторизоваться и кнопку на /login */}
        {!isAuthed ? (
          <div className="card cardPad stack" style={{ gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Требуется вход</h2>
              <div className="subtle">
                Для работы с сайтом необходимо сначала войти в аккаунт.
              </div>
            </div>

            <div className="row" style={{ flexWrap: "wrap" }}>
              <a className="btn btnPrimary" href="/login">Войти</a>
            </div>
          </div>
        ) : (
          <div className="card cardPad stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Вход выполнен ✅</div>
            <div className="subtle">
              {me ? (
                <>
                  Привет, <b>{me.username ? `@${me.username}` : me.first_name ?? "пользователь"}</b>! Теперь можно пользоваться сайтом.
                </>
              ) : (
                "Профиль загружается…"
              )}
            </div>
          </div>
        )}

        <div className="grid2">
          {/* Students */}
          <div className="card cardPad stack">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div className="stack" style={{ gap: 6 }}>
                <h3 style={{ fontSize: 15, margin: 0 }}>Для ученика / посредника</h3>
                <p className="subtle" style={{ margin: 0 }}>1. Включите режим "Ученик" на панели внизу</p>
                <p className="subtle" style={{ margin: 0 }}>2. Создайте заявку</p>
                <p className="subtle" style={{ margin: 0 }}>3. Ожидайте отклика репетиторов или предложите заявку репетиторам в разделе "Репетиторы"</p>
                <p className="subtle" style={{ margin: 0 }}>4. Подключите отправку уведомлений в Telegram, чтобы не пропустить отклики репетиторов</p>
              </div>
            </div>

            <div className="divider" />

            <div className="stack" style={{ gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Турбо-отклик</div>
                <p className="subtle" style={{ margin: 0 }}>
                  Включите Турбо при создании заявки — она автоматически репостится в наш Telegram‑канал, где её видят тысячи репетиторов.
                  Это помогает получить отклики заметно быстрее.
                </p>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <AuthRequiredLink className="btn btnPrimary" href="/requests/new" actionText="создать заявку">
                  Создать заявку
                </AuthRequiredLink>
                <a className="btn" href="/tutors">Подобрать репетитора</a>
              </div>
            </div>
          </div>

          {/* Tutors */}
          <div className="card cardPad stack">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div className="stack" style={{ gap: 6 }}>
                <h3 style={{ fontSize: 15, margin: 0 }}>Для репетитора</h3>
                <p className="subtle" style={{ margin: 0 }}>1. Включите режим "Репетитор" на панели внизу</p>
                <p className="subtle" style={{ margin: 0 }}>2. Создайте анкету репетитора</p>
                <p className="subtle" style={{ margin: 0 }}>3. Отправляйте отклики на заявки учеников</p>
                <p className="subtle" style={{ margin: 0 }}>4. Подключите отправку уведомлений в Telegram, чтобы не пропустить предложения по заявкам и изменение статусов по вашим откликам</p>
              </div>
            </div>

            <div className="divider" />

            <div className="stack" style={{ gap: 10 }}>
              <div className="stack" style={{ gap: 6 }}>
                <div style={{ fontWeight: 600 }}>Поднятие анкеты</div>
                <div className="subtle">
                  Поднимайте анкету, чтобы она была выше в списке репетиторов и чаще попадалась ученикам.
                </div>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <div style={{ fontWeight: 600 }}>Каталог репетиторов</div>
                <div className="subtle">
                  Ученики могут выбирать репетитора по предмету, уровню и формату — заполненная анкета повышает шанс попасть в выборку.
                </div>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <AuthRequiredLink className="btn btnPrimary" href="/tutors/me" actionText="создать анкету репетитора">
                  Создать / обновить анкету
                </AuthRequiredLink>
                <a className="btn" href="/requests">Найти заявки</a>
              </div>
            </div>
          </div>
        </div>

        <div className="card cardPad stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Как это работает?</h2>
          <div className="grid2" style={{ gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600 }}>1) Создайте заявку</div>
              <div className="subtle">Заполните несколько полей — этого достаточно, чтобы начать. Ожидайте откликов репетиторов или предлагайте заявку репетиторам из списка.</div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600 }}>2) После получения откликов</div>
              <div className="subtle">Внутри заявки увидите отклики репетиторов. Выбирайте подходящего, после чего можете писать ему сообщения во внутреннем чате или в Telegram.</div>
              <div className="subtle">Если по каким то причинам выбранный репетитор вам не подходит, можно в любой момент нажать "Поменять репетитора" в разделе "Мои заявки" и выбирать другие отклики</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
