import { NextRequest, NextResponse } from "next/server";
import { verifySignatureFile } from "@/lib/signature-verify";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Chybí soubor" }, { status: 400 });
    }

    const fileName = "name" in file && typeof file.name === "string" ? file.name : "upload";
    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Soubor je příliš velký (max 25 MB)" },
        { status: 400 }
      );
    }

    const result = verifySignatureFile(buffer, fileName);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ověření selhalo" },
      { status: 500 }
    );
  }
}
