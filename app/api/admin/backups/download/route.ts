import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  try {
    // Call the backend download endpoint
    const response = await fetch(`${API_BASE}/api/admin/backups/download?id=${id}`, {
      headers: {
        "x-admin-key": ADMIN_KEY,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.reason || "download_failed" },
        { status: response.status }
      );
    }

    // Get the binary data (base64 encoded from Lambda)
    const data = await response.arrayBuffer();
    
    // Get filename from header
    const contentDisposition = response.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch ? filenameMatch[1] : "backup.wsbak";

    // Return as binary
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
