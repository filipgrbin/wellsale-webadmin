import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

/**
 * Optional same-origin helper (like backups/download).
 * Prefer client → getReleaseDownloadUrl → S3; this exists for hard refresh / bookmarks.
 * Uses GET /api/admin/releases?downloadId=… (POST …/download-url is broken on APIGW).
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const version = request.nextUrl.searchParams.get("version");
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;

  if (!id && !version) {
    return NextResponse.json({ error: "missing_id_or_version" }, { status: 400 });
  }

  const qs = new URLSearchParams();
  if (id) qs.set("downloadId", id);
  if (version) qs.set("downloadVersion", version);

  try {
    const urlResponse = await fetch(`${API_BASE}/api/admin/releases?${qs}`, {
      method: "GET",
      headers: {
        "x-admin-key": adminKey,
      },
      cache: "no-store",
    });

    const payload = await urlResponse.json().catch(() => ({} as Record<string, unknown>));

    if (!urlResponse.ok) {
      return NextResponse.json(
        {
          error: payload.reason || payload.error || payload.message || "download_url_failed",
          detail: payload.detail,
          prefix: payload.prefix,
          bucket: payload.bucket,
          objects: payload.objects,
          s3Key: payload.s3Key,
        },
        { status: urlResponse.status }
      );
    }

    const downloadUrl = payload.downloadUrl || payload.url;
    if (!payload.ok || !downloadUrl) {
      return NextResponse.json(
        { error: "no_download_url", payload },
        { status: 502 }
      );
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
