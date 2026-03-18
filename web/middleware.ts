import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Some bots (and occasionally stale clients) spam POST requests to Next Server Actions endpoints
 * like /_next/actions/x which makes Next log noisy "Failed to find Server Action" errors.
 *
 * This project does not use Server Actions, so we short-circuit these requests with 404.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next/actions/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/_next/actions/:path*"],
};
