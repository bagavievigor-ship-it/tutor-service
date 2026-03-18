"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TelegramLoginWidget from "@/components/TelegramLoginWidget";

type TokenOut = {
  access_token: string;
  token_type: string;
};

type MeOut = {
  id: number;
  telegram_id: number | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  created_at: string;
  tg_chat_id?: number | null;
  tg_notify_enabled?: number | boolean;
  // на будущее: email/vk могут быть добавлены в /me
  email?: string | null;
};

function saveToken(token: string) {
  localStorage.setItem("r18_token", token);
  window.dispatchEvent(new Event("r18-auth-changed"));
}
function getToken(): string | null {
  return localStorage.getItem("r18_token");
}
function removeToken() {
  localStorage.removeItem("r18_token");
  window.dispatchEvent(new Event("r18-auth-changed"));
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export default function LoginPage() {
  const api = process.env.NEXT_PUBLIC_API_BASE!;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);

  // email auth state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailStage, setEmailStage] = useState<"idle" | "code_sent">("idle");
  const emailNorm = useMemo(() => normalizeEmail(email), [email]);

  const loadMe = useCallback(
    async (t: string) => {
      const res = await fetch(`${api}/me`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET /me failed: ${res.status} ${text}`);
      }

      const data: MeOut = await res.json();
      setMe(data);
    },
    [api]
  );

  // При загрузке страницы:
  // - читаем localStorage токен
  // - синхронизируем его в HttpOnly cookie через /api/auth/sync (SSR начнет его видеть)
  
// VK callback: VK redirects back to /login?code=...&state=...&device_id=...
useEffect(() => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const device_id = url.searchParams.get("device_id");
  const vkErr = url.searchParams.get("error") || url.searchParams.get("error_description");

  if (vkErr) {
    setError(`VK auth error: ${vkErr}`);
    return;
  }

  if (!code || !state) return;

  (async () => {
    try {
      setError(null);

      if (!device_id) {
        throw new Error("VK callback missing device_id");
      }

      const r = await fetch("/api/auth/vk/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state, device_id }),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`VK finish failed: ${r.status} ${t}`);
      }

      const data = (await r.json()) as TokenOut;
      if (!data?.access_token) throw new Error("VK finish returned no access_token");

      saveToken(data.access_token);
      setToken(data.access_token);

      await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.access_token }),
      });

      await loadMe(data.access_token);

      // clean URL params to avoid re-running on refresh
      ["code", "state", "device_id", "error", "error_description"].forEach((k) => url.searchParams.delete(k));
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : ""));
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  })();
}, [loadMe]);

useEffect(() => {
    const t = getToken();
    if (!t) return;

    setToken(t);

    (async () => {
      try {
        // 1) синхронизировать cookie (серверу надо)
        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        });

        // 2) подтянуть профиль для UI
        await loadMe(t);
      } catch (e: any) {
        console.error(e);
        removeToken();
        setToken(null);
        setMe(null);
      }
    })();
  }, [loadMe]);

  const onTelegramAuth = useCallback(
    async (user: Record<string, any>) => {
      setError(null);
      setLoading(true);

      try {
        // ВАЖНО: теперь ходим не напрямую в API, а в наш Next route,
        // который ставит HttpOnly cookie access_token
        const res = await fetch(`/api/auth/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API auth failed: ${res.status} ${text}`);
        }

        const data: TokenOut = await res.json();

        saveToken(data.access_token);
        setToken(data.access_token);

        await loadMe(data.access_token);
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [loadMe]
  );

  const startEmailLogin = useCallback(async () => {
    setError(null);

    const e = emailNorm;
    if (!e || !e.includes("@")) {
      setError("Введите корректный email.");
      return;
    }

    setLoading(true);
    try {
      // Ожидается, что этот Next route существует (добавляли в патче по email).
      // Если у тебя он называется иначе — скажи, подстрою.
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Email start failed: ${res.status} ${text}`);
      }

      // Могут быть доп.поля (например dev_code) — нам не важно.
      await res.json().catch(() => ({}));
      setEmailStage("code_sent");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [emailNorm]);

  const verifyEmailLogin = useCallback(async () => {
    setError(null);

    const e = emailNorm;
    const c = code.trim();
    if (!e || !e.includes("@")) {
      setError("Введите корректный email.");
      return;
    }
    if (!c || c.length < 4) {
      setError("Введите код из письма.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, code: c }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Email verify failed: ${res.status} ${text}`);
      }

      const data: TokenOut = await res.json();

      saveToken(data.access_token);
      setToken(data.access_token);
      setCode("");

      await loadMe(data.access_token);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [emailNorm, code, loadMe]);

  const startVkLogin = useCallback(() => {
    // Ожидается, что этот route делает редирект на VK и потом вернет на /login?...
    window.location.href = "/api/auth/vk/start";
  }, []);

  const logout = useCallback(() => {
    // удаляем cookie на сервере
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // и localStorage на клиенте
    removeToken();
    setToken(null);
    setMe(null);
  }, []);

  const meLabel = useMemo(() => {
    if (!me) return "Загружаем профиль…";
    if (me.username) return `@${me.username}`;
    if (me.first_name) return me.first_name;
    if (me.email) return me.email;
    return "—";
  }, [me]);

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <h1>Вход</h1>
          <p className="subtle">Выберите удобный способ: Telegram, VK или Email.</p>
        </div>

        {error ? (
          <div className="card cardPad">
            <div className="subtle" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          </div>
        ) : null}

        <div className="card cardPad stack" style={{ gap: 14 }}>
          {!token ? (
            <>
              {/* VK */}
              <div className="stack hiddens" style={{ gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Войти через VK</div>
                <button className="btn btnPrimary" onClick={startVkLogin} disabled={isLoading}>
                  Продолжить с VK
                </button>
              </div>

              <div className="divider" />

              {/* Email */}
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Войти по Email</div>
                <div className="subtle">Отправим код на почту — пароль не нужен.</div>

                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ minWidth: 260 }}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                  />
                  {emailStage === "idle" ? (
                    <button className="btn btnPrimary" onClick={startEmailLogin} disabled={isLoading}>
                      Получить код
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => {
                        setEmailStage("idle");
                        setCode("");
                      }}
                      disabled={isLoading}
                    >
                      Изменить email
                    </button>
                  )}
                </div>

                {emailStage === "code_sent" ? (
                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <input
                      className="input"
                      style={{ width: 160 }}
                      placeholder="Код"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                    />
                    <button className="btn btnPrimary" onClick={verifyEmailLogin} disabled={isLoading}>
                      Войти
                    </button>
                    <button className="btn" onClick={startEmailLogin} disabled={isLoading}>
                      Отправить ещё раз
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="divider" />

              {/* Telegram */}
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Войти через Telegram</div>
                <div className="subtle">Нажмите кнопку ниже и подтвердите вход в Telegram.</div>
                <TelegramLoginWidget onAuth={onTelegramAuth} />
              </div>
            </>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div className="stack" style={{ gap: 6 }}>
                  <div style={{ fontWeight: 800 }}>Вы вошли</div>
                  <div className="subtle">
                    Пользователь: <b>{meLabel}</b>
                  </div>
                </div>

                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <a className="btn btnPrimary" href="/me/requests">
                    Перейти в кабинет
                  </a>
                  <button className="btn" onClick={logout}>
                    Выйти
                  </button>
                </div>
              </div>

              <div className="divider" />

              {me && (!me.tg_chat_id || !Boolean(me.tg_notify_enabled === 1 || me.tg_notify_enabled === true)) ? (
                <div className="card cardPad" style={{ background: "#f3f4f6" }}>
                  <div style={{ fontWeight: 800 }}>Telegram-уведомления</div>
                  <div className="subtle" style={{ marginTop: 6 }}>
                    Хотите получать отклики и сообщения сразу в Telegram? Это удобно, если сайт закрыт.
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <a className="btn btnPrimary" href="/me/notifications#telegram">
                      Подключить
                    </a>
                    <a className="btn" href="/me/requests">
                      Позже
                    </a>
                  </div>
                </div>
              ) : null}

              <div className="subtle">Если что-то не так — можно выйти и войти снова.</div>
            </>
          )}

          {isLoading ? <div className="subtle">Загрузка…</div> : null}
        </div>
      </div>
    </main>
  );
}
