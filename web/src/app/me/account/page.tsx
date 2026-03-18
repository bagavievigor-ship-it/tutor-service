"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetchAuthed, clearToken } from "@/lib/api";
import TelegramLoginWidget from "@/components/TelegramLoginWidget";

type AuthMethod = {
  provider: string;
  label: string;
  is_linked: boolean;
};

type MeUser = {
  id: number;
  telegram_id?: number | null;
};

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export default function AccountPage() {
  const router = useRouter();

  const [me, setMe] = useState<MeUser | null>(null);
  const [methods, setMethods] = useState<AuthMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // email link flow
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailStage, setEmailStage] = useState<"idle" | "code_sent">("idle");
  const [devCode, setDevCode] = useState<string | null>(null);

  const emailNorm = useMemo(() => normalizeEmail(email), [email]);

  const emailLinked = useMemo(
    () => methods.find((m) => m.provider === "email")?.is_linked,
    [methods]
  );

  const tgLinked = useMemo(
    () => methods.find((m) => m.provider === "telegram")?.is_linked,
    [methods]
  );

  const vkLinked = useMemo(
    () => methods.find((m) => m.provider === "vk")?.is_linked,
    [methods]
  );

  async function refresh() {
    try {
      setErr(null);
      const uRes = await apiFetchAuthed("/me");
      const mRes = await apiFetchAuthed("/me/auth-methods");

      setMe(await (uRes as Response).json());
      setMethods(await (mRes as Response).json());
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function logout() {
    clearToken();
    router.push("/login");
  }

  async function linkTelegram(payload: any) {
    setErr(null);
    await apiFetchAuthed("/me/auth-methods/telegram/link", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    refresh();
  }

  async function emailStart() {
    try {
      setErr(null);
      setDevCode(null);

      if (!emailNorm) throw new Error("Введите email");
      const r = await apiFetchAuthed("/me/auth-methods/email/start", {
        method: "POST",
        body: JSON.stringify({ email: emailNorm }),
      });

      const data = await (r as Response).json().catch(() => ({} as any));
      if (!(r as Response).ok) {
        throw new Error(data?.detail || data?.error || "Не удалось отправить код");
      }

      if (data?.dev_code) setDevCode(String(data.dev_code));
      setEmailStage("code_sent");
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  async function emailVerify() {
    try {
      setErr(null);

      if (!emailNorm) throw new Error("Введите email");
      if (!code.trim()) throw new Error("Введите код");

      const r = await apiFetchAuthed("/me/auth-methods/email/verify", {
        method: "POST",
        body: JSON.stringify({ email: emailNorm, code: code.trim() }),
      });

      const data = await (r as Response).json().catch(() => ({} as any));
      if (!(r as Response).ok) {
        throw new Error(data?.detail || data?.error || "Не удалось подтвердить код");
      }

      // reset form
      setEmailStage("idle");
      setEmail("");
      setCode("");
      setDevCode(null);

      refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  if (loading) return <div className="card">Загрузка…</div>;

  return (
    <div style={{ maxWidth: 900, margin: "20px auto" }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Аккаунт</div>
            <div style={{ color: "#666" }}>ID: {me?.id}</div>
          </div>

          <button className="btn btnLight" onClick={logout}>
            Выйти
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Способы входа</div>

        {err && (
          <div style={{ marginTop: 10, color: "#b00020", whiteSpace: "pre-wrap" }}>
            {err}
          </div>
        )}

        {methods.map((m) => (
          <div
            key={m.provider}
            style={{
              display: "flex",
              justifyContent: "space-between",
              border: "1px solid #eee",
              padding: 12,
              borderRadius: 10,
              marginTop: 10,
            }}
          >
            <div>
              <b>{m.label}</b>
            </div>
            <div>{m.is_linked ? "Подключено" : "Не подключено"}</div>
          </div>
        ))}

        {!tgLinked && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700 }}>Привязать Telegram</div>
            <TelegramLoginWidget onAuth={linkTelegram} />
          </div>
        )}

        {!emailLinked && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700 }}>Привязать Email</div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ minWidth: 260, flex: 1 }}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn" onClick={emailStart}>
                Отправить код
              </button>
            </div>

            {emailStage === "code_sent" && (
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <input
                  className="input"
                  style={{ minWidth: 160 }}
                  placeholder="Код из письма"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn" onClick={emailVerify}>
                  Подтвердить
                </button>
                <button
                  className="btn btnLight"
                  onClick={() => {
                    setEmailStage("idle");
                    setCode("");
                    setDevCode(null);
                  }}
                >
                  Отмена
                </button>
              </div>
            )}

            {devCode && (
              <div style={{ marginTop: 8, color: "#666" }}>
                DEV_RETURN_EMAIL_CODE=1 → код: <b>{devCode}</b>
              </div>
            )}
          </div>
        )}

        {!vkLinked && (
          <div className="hiddens" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700 }}>Привязать VK</div>
            <button
              className="btn"
              onClick={() => {
                window.location.href = "/api/auth/vk/start?link=1";
              }}
            >
              Войти через VK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
