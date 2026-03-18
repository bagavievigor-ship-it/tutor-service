import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE is not set" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token;

  if (!token) {
    return NextResponse.json({ ok: false, reason: "no token" }, { status: 400 });
  }

  // Проверяем токен на бэке (чтобы не принимать мусор)
  const r = await fetch(`${api}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    return NextResponse.json(
      { ok: false, reason: `token invalid: ${r.status}`, details: text },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set({
    name: "access_token",
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
