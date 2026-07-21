import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

/**
 * Same-origin proxy: get S3 presigned URL server-side, fetch the object,
 * stream bytes to the browser (avoids S3 CORS on webadmin origin).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
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

    const fileResponse = await fetch(urlData.downloadUrl, { cache: "no-store" });
    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: "s3_download_failed" },
        { status: fileResponse.status === 403 ? 502 : fileResponse.status }
      );
    }

    const data = await fileResponse.arrayBuffer();
    const filename =
      String(urlData.file_name || urlData.filename || "").trim() ||
      `backup-${id}.wsbak`;

    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
