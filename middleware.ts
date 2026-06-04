// middleware.ts
//
// Minimale: propaga il pathname corrente come header `x-pathname` sulla
// REQUEST (usato da `requireAdmin()` in lib/admin/auth.ts via headers() per
// costruire il redirect `?next=<current>`).
//
// NIENTE LOGICA AUTH QUI:
// - L'admin gate è in `requireAdmin()` chiamato dai server component
//   sotto `app/(admin)/*` (legge cookie iron-session firmato)
// - L'app Flutter usa Supabase Auth via SDK lato client — non passa per
//   questo middleware (non è web)
//
// Niente Supabase qui: l'admin web non usa più Supabase Auth.

import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

// Match tutte le route eccetto:
//   - /api               (route handler hanno la loro logica auth)
//   - /auth              (pagine pubbliche: reset password cross-device per Flutter)
//   - _next/static, _next/image (asset)
//   - favicon, robots, sitemap
export const config = {
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
