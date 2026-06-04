// app/api/admin/logout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { destroyAdminSession } from "@/lib/admin/auth";

/// POST /api/admin/logout — distrugge il cookie iron-session e redirige al login.
/// Chiamato dal bottone "Esci" nella topbar (form POST classico).
export async function POST(req: NextRequest) {
  await destroyAdminSession();
  return NextResponse.redirect(new URL("/admin/login", req.url), 303);
}
