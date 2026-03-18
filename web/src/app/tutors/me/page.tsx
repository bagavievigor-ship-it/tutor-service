"use client";

import { useEffect, useState } from "react";
import { apiFetchAuthed } from "@/lib/api";
import Avatar from "@/components/Avatar";

type TutorUpsertIn = {
  display_name: string;
  bio: string;
  subjects: string[];
  levels: string[];
  formats: string[];
  city: string | null;
  price_from: number | null;
  price_to: number | null;
  is_listed: boolean;
  seo_title: string | null;
  seo_description: string | null;
  telegram_contact: string;
  vk_contact?: string | null;
};

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinList(a: string[]): string {
  return (a || []).join(", ");
}

export default function TutorMePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const [subjectsText, setSubjectsText] = useState("");
  const [levelsText, setLevelsText] = useState("");
  const [formatsText, setFormatsText] = useState("");

  const [city, setCity] = useState("");
  const [priceFrom, setPriceFrom] = useState<string>("");
  const [priceTo, setPriceTo] = useState<string>("");

  const [isListed, setIsListed] = useState(true);

  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [telegramContact, setTelegramContact] = useState("");
  const [vkContact, setVkContact] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoInputKey, setPhotoInputKey] = useState(0);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        // Сначала проверяем, есть ли анкета, чтобы не получать 404 в консоли
        const ex = await apiFetchAuthed("/tutors/me/exists");
        const exj = ex.ok ? await ex.json() : { exists: false };
        if (exj.exists) {
          const res = await apiFetchAuthed("/tutors/me");
          if (!res.ok) throw new Error(`Ошибка загрузки анкеты (HTTP ${res.status})`);
          const t = await res.json();
          setDisplayName(t.display_name || "");
          setBio(t.bio || "");
          setSubjectsText(joinList(t.subjects || []));
          setLevelsText(joinList(t.levels || []));
          setFormatsText(joinList(t.formats || []));
          setCity(t.city || "");
          setPriceFrom(t.price_from != null ? String(t.price_from) : "");
          setPriceTo(t.price_to != null ? String(t.price_to) : "");
          setIsListed(!!t.is_listed);
          setSeoTitle(t.seo_title || "");
          setSeoDescription(t.seo_description || "");
          setTelegramContact(t.telegram_contact || "");
          setVkContact(t.vk_contact || "");
          setPhotoUrl(t.photo_url || null);
        }
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки анкеты");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function uploadPhoto() {
    setError(null);
    setInfo(null);
    if (!photoFile) {
      setError("Выберите изображение для загрузки.");
      return;
    }
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", photoFile);
      const res = await apiFetchAuthed("/tutors/me/photo", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Ошибка загрузки фото (HTTP ${res.status})`);
      const t = await res.json();
      setPhotoUrl(t.photo_url || null);
      setPhotoFile(null);
      setPhotoInputKey((k) => k + 1);
      setInfo("Фото загружено ✅");
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки фото");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    setError(null);
    setInfo(null);
    setPhotoBusy(true);
    try {
      const res = await apiFetchAuthed("/tutors/me/photo", { method: "DELETE" });
      if (!res.ok) throw new Error(`Ошибка удаления фото (HTTP ${res.status})`);
      const t = await res.json();
      setPhotoUrl(t.photo_url || null);
      setPhotoFile(null);
      setPhotoInputKey((k) => k + 1);
      setInfo("Фото удалено ✅");
    } catch (e: any) {
      setError(e?.message ?? "Ошибка удаления фото");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setError(null);
    setInfo(null);

    const dn = displayName.trim();
    const b = bio.trim();

    if (dn.length < 2) {
      setError("Имя/название анкеты: минимум 2 символа.");
      return;
    }
    if (b.length < 10) {
      setError("О себе (bio): минимум 10 символов.");
      return;
    }


    const tg = telegramContact.trim();
    if (tg.length < 2) {
      setError("Укажи Telegram для связи (например: @username или https://t.me/username).");
      return;
    }

    const payload: TutorUpsertIn = {
      display_name: dn,
      bio: b,
      subjects: splitList(subjectsText),
      levels: splitList(levelsText),
      formats: splitList(formatsText),
      city: city.trim() ? city.trim() : null,
      price_from: priceFrom.trim() ? Number(priceFrom) : null,
      price_to: priceTo.trim() ? Number(priceTo) : null,
      is_listed: isListed,
      seo_title: seoTitle.trim() ? seoTitle.trim() : null,
      seo_description: seoDescription.trim() ? seoDescription.trim() : null,
      telegram_contact: telegramContact.trim(),
      vk_contact: vkContact.trim() ? vkContact.trim() : null,
    };

    setSaving(true);
    try {
      const res = await apiFetchAuthed("/tutors/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Ошибка сохранения (HTTP ${res.status})`);
      }

      setInfo("Анкета сохранена ✅");
    } catch (e: any) {
      setError(e?.message ?? "Ошибка сохранения анкеты");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <div className="container stack">
        <div className="pageHeader">
          <h1>Моя анкета репетитора</h1>
          <p className="subtle">
            Чтобы откликаться на заявки — анкета должна быть заполнена (имя + описание). Если включить «Показывать в каталоге»,
            вы появитесь в разделе <a className="btnLink" href="/tutors">Репетиторы</a>.
          </p>
        </div>

        {loading ? (
          <div className="card cardPad">
            <div className="subtle">Загрузка…</div>
          </div>
        ) : (
          <>
            {error ? (
              <div className="card cardPad">
                <div className="subtle" style={{ color: "var(--danger)" }}>{error}</div>
              </div>
            ) : null}

            {info ? (
              <div className="card cardPad">
                <div className="subtle" style={{ color: "var(--success)" }}>{info}</div>
              </div>
            ) : null}

            <div className="card cardPad stack" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 10 }}>

              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Avatar url={photoUrl} name={displayName || "Фото"} size={96} />
                <div className="stack" style={{ gap: 8, flex: 1 }}>
                  <div className="subtle">Фото (необязательно)</div>
                  <input
                    key={photoInputKey}
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" type="button" onClick={uploadPhoto} disabled={photoBusy || !photoFile}>
                      {photoBusy ? "Загрузка…" : "Загрузить фото"}
                    </button>
                    {photoUrl ? (
                      <button className="btn" type="button" onClick={deletePhoto} disabled={photoBusy}>
                        Удалить
                      </button>
                    ) : null}
                                      </div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    Если фото не загружено — используется аватар из Telegram.
                  </div>
                </div>
              </div>


                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Имя и Фамилия</div>
                  <input
                    className="input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Укажите имя и фамилию"
                  />
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Описание</div>
                  <textarea
                    className="input"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={6}
                    placeholder="Коротко о себе, подход, опыт, результаты…"
                  />
                </label>
              </div>

              <div className="grid2">
                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Предметы (через запятую)</div>
                  <input
                    className="input"
                    value={subjectsText}
                    onChange={(e) => setSubjectsText(e.target.value)}
                    placeholder="математика, физика"
                  />
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Уровни (через запятую)</div>
                  <input
                    className="input"
                    value={levelsText}
                    onChange={(e) => setLevelsText(e.target.value)}
                    placeholder="школа, ОГЭ, ЕГЭ"
                  />
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Форматы (через запятую)</div>
                  <input
                    className="input"
                    value={formatsText}
                    onChange={(e) => setFormatsText(e.target.value)}
                    placeholder="онлайн, оффлайн"
                  />
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Город (необязательно)</div>
                  <input
                    className="input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Москва"
                  />
                </label>

                <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                  <label className="stack" style={{ gap: 6, flex: 1, minWidth: 260 }}>
                    <div className="subtle">Telegram для связи (обязательно)</div>
                    <input
                      className="input"
                      value={telegramContact}
                      onChange={(e) => setTelegramContact(e.target.value)}
                      placeholder="@username или https://t.me/username"
                    />
                    <div className="subtle" style={{ fontSize: 12 }}>
                      Будет показано ученикам в анкете.
                    </div>
                  </label>

                  <label className="stack" style={{ gap: 6, flex: 1, minWidth: 260 }}>
                    <div className="subtle">ВК для связи (необязательно)</div>
                    <input
                      className="input"
                      value={vkContact}
                      onChange={(e) => setVkContact(e.target.value)}
                      placeholder="username или https://vk.com/username"
                    />
                    <div className="subtle" style={{ fontSize: 12 }}>
                      Если заполните — появится кнопка ВК на странице анкеты.
                    </div>
                  </label>
                </div>

                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Цена от</div>
                  <input
                    className="input"
                    value={priceFrom}
                    onChange={(e) => setPriceFrom(e.target.value)}
                    inputMode="numeric"
                    placeholder="1000"
                  />
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <div className="subtle">Цена до</div>
                  <input
                    className="input"
                    value={priceTo}
                    onChange={(e) => setPriceTo(e.target.value)}
                    inputMode="numeric"
                    placeholder="3000"
                  />
                </label>
              </div>

              <div className="divider" />

              <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <label className="row" style={{ gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={isListed}
                    onChange={(e) => setIsListed(e.target.checked)}
                  />
                  <span style={{ fontWeight: 700 }}>Показывать в каталоге</span>
                </label>

                <button className="btn btnPrimary" disabled={saving} onClick={save}>
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>

              <details className="card" style={{ padding: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>SEO (необязательно)</summary>
                <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                  <label className="stack" style={{ gap: 6 }}>
                    <div className="subtle">SEO заголовок</div>
                    <input
                      className="input"
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                      placeholder="Репетитор по математике онлайн"
                    />
                  </label>

                  <label className="stack" style={{ gap: 6 }}>
                    <div className="subtle">SEO описание</div>
                    <textarea
                      className="input"
                      value={seoDescription}
                      onChange={(e) => setSeoDescription(e.target.value)}
                      rows={3}
                      placeholder="Короткое описание для поисковых систем"
                    />
                  </label>
                </div>
              </details>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
