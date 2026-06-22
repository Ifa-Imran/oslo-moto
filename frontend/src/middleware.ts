import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to set proper HTTP cache-control headers.
 *
 * Without this, Next.js sets `Cache-Control: s-maxage=31536000` on statically
 * pre-rendered pages, causing browsers and CDNs to cache the page for 1 year.
 * This means users may see stale HTML referencing old (broken) JS chunks.
 *
 * Strategy:
 * - HTML pages: no-cache (must always revalidate to get fresh HTML)
 * - Static assets (_next/static/*): aggressive caching (they have content hashes)
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const accept = request.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");
  const isStaticAsset = request.nextUrl.pathname.startsWith("/_next/static/");

  if (isHTML && !isStaticAsset) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

export const config = {
  // Run on all routes except static assets and images
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
