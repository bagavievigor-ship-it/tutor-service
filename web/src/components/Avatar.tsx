"use client";

import React from "react";

function initials(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

export default function Avatar({
  url,
  name,
  size = 44,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const r = Math.max(28, Math.floor(size));
  const bg = "var(--card)";
  const bd = "1px solid var(--border)";
  return (
    <div
      aria-label={name ?? "Аватар"}
      title={name ?? undefined}
      style={{
        width: r,
        height: r,
        borderRadius: 999,
        overflow: "hidden",
        border: bd,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name ?? ""} width={r} height={r} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontWeight: 800, color: "var(--muted)", userSelect: "none" }}>{initials(name)}</span>
      )}
    </div>
  );
}
