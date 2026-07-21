import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

/**
 * Never buffer Setup.exe through Next (large → 413).
 * Resolve a presigned S3 URL and 302-redirect the browser there.
 *
 * Query: id=…  or  version=…
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const version = request.nextUrl.searchParams.get("version");
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;

  if (!id && !version) {
    return NextResponse.json({ error: "missing_id_or_version" }, { status: 400 });
  }

  const body: Record<string, unknown> = {};
  if (id) body.id = Number(id);
  if (version) body.version = version;

  try {
    const urlResponse = await fetch(`${API_BASE}/api/admin/releases/download-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!urlResponse.ok) {
      const errorData = await urlResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            errorData.reason ||
            errorData.error ||
            errorData.message ||
            "download_url_failed",
        },
        { status: urlResponse.status }
      );
    }

    const urlData = await urlResponse.json();
    const downloadUrl = urlData.downloadUrl || urlData.url;
    if (!urlData.ok || !downloadUrl) {
      return NextResponse.json({ error: "no_download_url" }, { status: 502 });
    }

    return NextResponse.redirect(downloadUrl, 302);
  } catch (error) {
    console.error("Release download redirect error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
