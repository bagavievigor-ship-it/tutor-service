import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { access_token?: string };

    const token = body?.access_token;
    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "No token" }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });

    res.cookies.set({
      name: "access_token",
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // 30 дней
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}

// (необязательно) чтобы можно было удалить cookie при логауте
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "access_token",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
