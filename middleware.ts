import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminAuthed = request.cookies.get("auth")?.value === "true";

  // Subadmin area is the public root. It is fully independent
  // (localStorage-based session), never gated by the admin cookie, and a
  // subadmin session never grants admin access. Root (/) and branch detail
  // pages (/branch/...) belong to the subadmin and stay open.
  if (pathname === "/" || pathname.startsWith("/branch")) {
    return NextResponse.next();
  }

  // The admin login API must always be reachable.
  if (pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  // Backup decrypt/download routes authenticate via x-admin-key internally
  // (subadmin panel also uses these for preview without an admin cookie).
  if (
    pathname === "/api/admin/backups/decrypt" ||
    pathname === "/api/admin/backups/intraday" ||
    pathname === "/api/admin/backups/download" ||
    pathname === "/api/signature/verify"
  ) {
    return NextResponse.next();
  }

  // Admin login page: if already authenticated as admin, skip straight to the
  // dashboard. A subadmin (no admin cookie) won't match this and still sees the
  // password prompt — so a subadmin session can't slip into the admin area.
  if (pathname === "/login") {
    if (isAdminAuthed) {
      return NextResponse.redirect(new URL("/mainadmin", request.url));
    }
    return NextResponse.next();
  }

  // Everything else (the admin dashboard at /mainadmin and admin APIs)
  // requires a valid admin cookie.
  if (!isAdminAuthed) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
