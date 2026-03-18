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

  const body = await req.json().catch(() => null);
  const email = body?.email;
  const code = body?.code;
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 422 });
  }
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 422 });
  }

  const r = await fetch(`${api}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    return NextResponse.json({ error: `API email/verify failed: ${r.status}`, details: text }, { status: r.status });
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
