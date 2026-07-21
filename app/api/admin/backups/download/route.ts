import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

/**
 * Never buffer the backup through Next (large files → 413 on the edge).
 * Resolve a presigned S3 URL and 302-redirect the browser there.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;

  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  try {
    const urlResponse = await fetch(`${API_BASE}/api/admin/backups/download-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ id: Number(id) }),
      cache: "no-store",
    });

    if (!urlResponse.ok) {
      const errorData = await urlResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.reason || errorData.error || "download_url_failed" },
        { status: urlResponse.status }
      );
    }

    const urlData = await urlResponse.json();
    if (!urlData.ok || !urlData.downloadUrl) {
      return NextResponse.json({ error: "no_download_url" }, { status: 502 });
    }

    return NextResponse.redirect(urlData.downloadUrl, 302);
  } catch (error) {
    console.error("Download redirect error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
