import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

/**
 * Same-origin proxy for GET /api/admin/pos/stock-movements.
 */
export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;
  const qs = request.nextUrl.searchParams.toString();
  const url = `${API_BASE}/api/admin/pos/stock-movements${qs ? `?${qs}` : ""}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({
      ok: false,
      reason: "invalid_upstream_json",
    }));

    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        reason: "proxy_failed",
        error: e instanceof Error ? e.message : "Upstream fetch failed",
      },
      { status: 502 }
    );
  }
}
