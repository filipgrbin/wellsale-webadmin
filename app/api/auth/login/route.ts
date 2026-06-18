import { NextRequest, NextResponse } from "next/server";

const MASTER_PASSWORD = "xpna5P6pvjUeVb";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password || password !== MASTER_PASSWORD) {
    return NextResponse.json(
      { error: "Neplatné heslo" },
      { status: 401 }
    );
  }

  // Create response with auth cookie
  const response = NextResponse.json({ ok: true });
  
  // Set secure session cookie
  response.cookies.set("auth", "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });

  return response;
}
