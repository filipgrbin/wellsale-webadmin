import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
/** Large Setup.exe releases — allow longer upload through this proxy. */
export const maxDuration = 300;

/**
 * Same-origin proxy: browser → webadmin → S3 presigned PUT.
 * Avoids browser CORS against the private UPDATE_S3_BUCKET.
 *
 * multipart fields:
 *   file       — binary
 *   uploadUrl  — presigned S3 URL
 *   headers    — JSON object of signed headers from upload-urls API
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const uploadUrl = String(form.get("uploadUrl") || "");
    const headersRaw = String(form.get("headers") || "{}");

    if (!(file instanceof Blob) || !uploadUrl) {
      return NextResponse.json(
        { ok: false, error: "file and uploadUrl are required" },
        { status: 400 }
      );
    }

    if (!uploadUrl.startsWith("https://") || !uploadUrl.includes(".amazonaws.com/")) {
      return NextResponse.json({ ok: false, error: "invalid_upload_url" }, { status: 400 });
    }

    let headers: Record<string, string> = {};
    try {
      const parsed = JSON.parse(headersRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        headers = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, String(v)])
        );
      }
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_headers_json" }, { status: 400 });
    }

    const body = Buffer.from(await file.arrayBuffer());
    const s3Res = await fetch(uploadUrl, {
      method: "PUT",
      body,
      headers,
    });

    if (!s3Res.ok) {
      const text = await s3Res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: "s3_upload_failed",
          status: s3Res.status,
          detail: text.slice(0, 500),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "proxy_upload_failed" },
      { status: 500 }
    );
  }
}
