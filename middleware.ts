import { NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/login", "/api/auth/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public routes and the subadmin section
  if (publicRoutes.includes(pathname) || pathname.startsWith("/subadmin")) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get("auth")?.value;

  if (!authCookie) {
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
