import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const api = process.env.NEXT_PUBLIC_API_BASE;
  if (!api) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email;
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 422 });
  }

  const r = await fetch(`${api}/auth/email/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });

  const text = await r.text();
  if (!r.ok) {
    return NextResponse.json({ error: `API email/start failed: ${r.status}`, details: text }, { status: r.status });
  }

  // passthrough (dev_code may be present in dev)
  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
