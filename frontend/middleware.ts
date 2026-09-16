import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Temporary kill-switch: set MAINTENANCE_MODE=true in Vercel's env vars to
// send every real page to a static "back shortly" screen instead of the
// app, without touching any backend service or losing indexed data —
// the indexer/API keep running underneath, the public just can't see them.
// Flip the env var back to unset/false and redeploy to undo.
const MAINTENANCE = process.env.MAINTENANCE_MODE === "true";

export function middleware(req: NextRequest) {
  if (!MAINTENANCE) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/maintenance")) return NextResponse.next();

  return NextResponse.rewrite(new URL("/maintenance", req.url));
}

export const config = {
  // Everything except the API proxy, Next's own static/image assets, and the
  // favicon — those should keep working (or just passing through) regardless.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
