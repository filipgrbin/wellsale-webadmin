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

    const payload = await urlResponse.json().catch(() => ({}));

    if (!urlResponse.ok) {
      return NextResponse.json(
        {
          error:
            payload.reason ||
            payload.error ||
            payload.message ||
            "download_url_failed",
          detail: payload.detail || payload.s3Key || payload.prefix,
        },
        { status: urlResponse.status >= 500 ? 502 : urlResponse.status }
      );
    }

    const downloadUrl = payload.downloadUrl || payload.url;
    if (!payload.ok || !downloadUrl) {
      return NextResponse.json({ error: "no_download_url" }, { status: 502 });
    }

    return NextResponse.redirect(String(downloadUrl), 302);
  } catch (error) {
    console.error("Release download redirect error:", error);
    return NextResponse.json(
      {
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
