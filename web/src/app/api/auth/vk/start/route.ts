import { NextResponse } from "next/server";

/**
 * VK start endpoint for the browser.
 *
 * We intentionally avoid doing a server-side fetch to the API here:
 * - eliminates "Unexpected token <" (HTML error pages) JSON parse issues
 * - avoids network/DNS/SSL differences between server and browser
 *
 * The API endpoint /auth/vk/start is responsible for building the VK authorize URL
 * and issuing a redirect to VK.
 */
export async function GET(req: Request) {
  const apiBase =
    (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.app.repetitor18.ru")
      .toString()
      .replace(/\/+$/, "");

  // Redirect the browser to the API start endpoint (which then redirects to VK).
  return NextResponse.redirect(`${apiBase}/auth/vk/start`, { status: 302 });
}
