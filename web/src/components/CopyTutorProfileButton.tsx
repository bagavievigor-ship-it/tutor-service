"use client";

import { useMemo, useState } from "react";
import { buildTutorProfileText, type TutorShareOut } from "@/lib/tutorProfileShare";

export default function CopyTutorProfileButton({ tutor }: { tutor: TutorShareOut }) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    return buildTutorProfileText(tutor, { includeLinkLine: true });
  }, [tutor]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <button className="btn" onClick={copy} title="Скопировать текст анкеты">
      {copied ? "Скопировано" : "Копировать анкету"}
    </button>
  );
}
