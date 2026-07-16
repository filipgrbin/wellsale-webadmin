import { NextRequest, NextResponse } from "next/server";
import { fetchAndDecryptBackupById } from "@/lib/backup-wsbak-server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing backup ID" }, { status: 400 });
  }

  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "Missing admin key" }, { status: 401 });
  }

  try {
    const { data } = await fetchAndDecryptBackupById(Number(id), adminKey, API_BASE);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("[decrypt] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Decryption failed" },
      { status: 500 }
    );
  }
}
