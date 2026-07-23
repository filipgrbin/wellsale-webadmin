import type { jsPDF } from "jspdf";

/**
 * Registers Arial into jsPDF (same family as POS pdfFont.ts).
 * Pass base64 of arial.ttf / arialbd.ttf from public/fonts.
 */
export function registerCzechFont(
  doc: jsPDF,
  regB64: string | null,
  boldB64: string | null
): string {
  if (regB64) {
    doc.addFileToVFS("Arial-Regular.ttf", regB64);
    doc.addFont("Arial-Regular.ttf", "Arial", "normal");
  }
  if (boldB64) {
    doc.addFileToVFS("Arial-Bold.ttf", boldB64);
    doc.addFont("Arial-Bold.ttf", "Arial", "bold");
  }
  if (regB64) {
    doc.setFont("Arial", "normal");
    return "Arial";
  }
  return "helvetica";
}
