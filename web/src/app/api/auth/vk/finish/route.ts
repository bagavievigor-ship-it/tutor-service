import { NextResponse } from "next/server";

type TokenOut = {
  access_token: string;
  token_type: string;
};

export async function POST(req: Request) {
  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE is not set" }, { status: 500 });
  }

  const payload = await req.json();

  const r = await fetch(`${api}/auth/vk/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    return NextResponse.json({ error: `API vk/finish failed: ${r.status}`, details: text }, { status: 400 });
  }

  const data = (await r.json()) as TokenOut;
  const token = data?.access_token;

  if (!token) {
    return NextResponse.json({ error: "No access_token returned" }, { status: 400 });
  }

  const res = NextResponse.json(data);
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
