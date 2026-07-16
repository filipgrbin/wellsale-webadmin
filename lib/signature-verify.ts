import crypto from "crypto";
import forge from "node-forge";

export interface SignatureSignerInfo {
  commonName: string | null;
  organization: string | null;
  email: string | null;
  serialNumber: string | null;
  thumbprintSha1: string | null;
  thumbprintSha256: string | null;
  issuer: string | null;
  notBefore: string | null;
  notAfter: string | null;
  signedAt: string | null;
}

export interface SignatureVerifyResult {
  fileName: string;
  fileKind: "p7s" | "pdf" | "xml" | "unknown";
  formatLabel: string;
  signed: boolean;
  /** true = crypto OK, false = failed, null = metadata only (no CA chain) */
  cryptographicallyValid: boolean | null;
  signers: SignatureSignerInfo[];
  subFilter: string | null;
  warnings: string[];
  errors: string[];
  details: string[];
}

function certField(cert: forge.pki.Certificate, shortName: string): string | null {
  const f = cert.subject.getField(shortName as forge.pki.CertificateFieldShortName);
  return f?.value ? String(f.value) : null;
}

function certIssuerString(cert: forge.pki.Certificate): string {
  const parts = cert.issuer.attributes
    .map((a) => `${a.shortName}=${a.value}`)
    .filter(Boolean);
  return parts.join(", ") || "—";
}

function certThumbprints(cert: forge.pki.Certificate): {
  sha1: string;
  sha256: string;
} {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const buf = Buffer.from(der, "binary");
  return {
    sha1: crypto.createHash("sha1").update(buf).digest("hex").toUpperCase(),
    sha256: crypto.createHash("sha256").update(buf).digest("hex").toUpperCase(),
  };
}

function parseForgeDate(d: Date | string | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("cs-CZ", { hour12: false });
}

function signerFromCert(
  cert: forge.pki.Certificate,
  signedAt: string | null
): SignatureSignerInfo {
  const tp = certThumbprints(cert);
  return {
    commonName: certField(cert, "CN"),
    organization: certField(cert, "O"),
    email: certField(cert, "E") ?? certField(cert, "emailAddress"),
    serialNumber: cert.serialNumber,
    thumbprintSha1: tp.sha1,
    thumbprintSha256: tp.sha256,
    issuer: certIssuerString(cert),
    notBefore: parseForgeDate(cert.validity.notBefore),
    notAfter: parseForgeDate(cert.validity.notAfter),
    signedAt,
  };
}

function extractSigningTimeFromPkcs7(p7: forge.pkcs7.PkcsSignedData): string | null {
  try {
    const signers = (p7 as unknown as { signers?: Array<{ authenticatedAttributes?: forge.asn1.Asn1[] }> })
      .signers;
    if (!signers?.length) return null;
    for (const s of signers) {
      for (const attr of s.authenticatedAttributes ?? []) {
        if (attr.value && Array.isArray(attr.value)) {
          for (const inner of attr.value) {
            if (inner.type === forge.pki.oids.signingTime) {
              const v = inner.value;
              if (v instanceof Date) return parseForgeDate(v);
              if (typeof v === "string") return parseForgeDate(v);
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function parsePkcs7Buffer(
  buffer: Buffer,
  ctx: { fileName: string; subFilter?: string | null }
): SignatureVerifyResult {
  const result: SignatureVerifyResult = {
    fileName: ctx.fileName,
    fileKind: "p7s",
    formatLabel: "PKCS#7 / CMS (P7S)",
    signed: false,
    cryptographicallyValid: null,
    signers: [],
    subFilter: ctx.subFilter ?? null,
    warnings: [],
    errors: [],
    details: [],
  };

  try {
    const asn1 = forge.asn1.fromDer(buffer.toString("binary"));
    const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData;
    result.signed = true;
    result.details.push("Nalezen PKCS#7/CMS podpis");

    const signedAt = extractSigningTimeFromPkcs7(p7);
    if (signedAt) result.details.push(`Čas podpisu (atribut): ${signedAt}`);

    const certs = p7.certificates ?? [];
    if (certs.length === 0) {
      result.warnings.push("V kontejneru nejsou certifikáty — zobrazena jen metadata.");
    }

    for (const cert of certs) {
      result.signers.push(signerFromCert(cert, signedAt));
    }

    try {
      const verified = p7.verify();
      result.cryptographicallyValid = verified;
      if (verified) {
        result.details.push("Kryptografická kontrola podpisu nad obsahem: OK");
      } else {
        result.warnings.push(
          "Kryptografické ověření selhalo (může chybět originální soubor nebo důvěryhodný kořen CA)."
        );
      }
    } catch {
      result.cryptographicallyValid = null;
      result.warnings.push(
        "Plné kryptografické ověření nebylo možné — zobrazena metadata certifikátu."
      );
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "Nepodařilo se parsovat PKCS#7");
  }

  return result;
}

function extractPdfPkcs7(buffer: Buffer): {
  pkcs7: Buffer | null;
  subFilter: string | null;
  name: string | null;
  modDate: string | null;
} {
  const text = buffer.toString("latin1");
  const subFilterMatch = text.match(/\/SubFilter\s*\/([^\s/>[\]()]+)/);
  const subFilter = subFilterMatch?.[1] ?? null;

  const nameMatch = text.match(/\/Name\s*\(([^)]+)\)/);
  const name = nameMatch?.[1] ?? null;

  const modMatch = text.match(/\/M\s*\(D:(\d{14}[^)]*)\)/);
  let modDate: string | null = null;
  if (modMatch) {
    const raw = modMatch[1];
    const y = raw.slice(0, 4);
    const mo = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const h = raw.slice(8, 10);
    const mi = raw.slice(10, 12);
    const s = raw.slice(12, 14);
    modDate = `${d}.${mo}.${y} ${h}:${mi}:${s}`;
  }

  const contentsMatch = text.match(/\/Contents\s*<([0-9A-Fa-f\s]+)>/);
  if (!contentsMatch) {
    return { pkcs7: null, subFilter, name, modDate };
  }
  const hex = contentsMatch[1].replace(/\s/g, "");
  if (hex.length < 20) return { pkcs7: null, subFilter, name, modDate };
  return {
    pkcs7: Buffer.from(hex, "hex"),
    subFilter,
    name,
    modDate,
  };
}

function parsePdfBuffer(buffer: Buffer, fileName: string): SignatureVerifyResult {
  const { pkcs7, subFilter, name, modDate } = extractPdfPkcs7(buffer);

  const formatLabel =
    subFilter?.includes("adbe.pkcs7")
      ? "PDF / PAdES (PKCS#7 detached)"
      : subFilter?.includes("ETSI")
        ? "PDF / PAdES (ETSI CAdES)"
        : "PDF s elektronickým podpisem";

  if (!pkcs7) {
    const hasSig = buffer.toString("latin1").includes("/Type/Sig") || buffer.toString("latin1").includes("/Type /Sig");
    return {
      fileName,
      fileKind: "pdf",
      formatLabel: hasSig ? formatLabel : "PDF",
      signed: hasSig,
      cryptographicallyValid: null,
      signers: name
        ? [{ commonName: name, organization: null, email: null, serialNumber: null, thumbprintSha1: null, thumbprintSha256: null, issuer: null, notBefore: null, notAfter: null, signedAt: modDate }]
        : [],
      subFilter,
      warnings: hasSig
        ? ["Podpis v PDF detekován, ale PKCS#7 blok se nepodařilo extrahovat."]
        : ["V PDF nebyl nalezen podpis."],
      errors: [],
      details: subFilter ? [`SubFilter: ${subFilter}`] : [],
    };
  }

  const parsed = parsePkcs7Buffer(pkcs7, { fileName, subFilter });
  parsed.fileKind = "pdf";
  parsed.formatLabel = formatLabel;
  parsed.subFilter = subFilter;
  if (modDate && parsed.signers[0]) {
    parsed.signers[0].signedAt = parsed.signers[0].signedAt ?? modDate;
  }
  if (name && parsed.signers.length === 0) {
    parsed.signers.push({
      commonName: name,
      organization: null,
      email: null,
      serialNumber: null,
      thumbprintSha1: null,
      thumbprintSha256: null,
      issuer: null,
      notBefore: null,
      notAfter: null,
      signedAt: modDate,
    });
  }
  parsed.details.unshift("Podpis extrahován z PDF");
  if (subFilter) parsed.details.push(`SubFilter: ${subFilter}`);
  return parsed;
}

function parseXmlBuffer(buffer: Buffer, fileName: string): SignatureVerifyResult {
  const xml = buffer.toString("utf8");
  const result: SignatureVerifyResult = {
    fileName,
    fileKind: "xml",
    formatLabel: "XML / XAdES",
    signed: /(<[^:]*:?Signature[\s>]|URI="http:\/\/www.w3.org\/2000\/09\/xmldsig#")/.test(xml),
    cryptographicallyValid: null,
    signers: [],
    subFilter: null,
    warnings: [],
    errors: [],
    details: [],
  };

  if (!result.signed) {
    result.warnings.push("V XML nebyl nalezen element podpisu (XMLDSig/XAdES).");
    return result;
  }

  result.details.push("Nalezen XML digitální podpis");

  const signingTime =
    xml.match(/<(?:[\w-]+:)?SigningTime[^>]*>([^<]+)</i)?.[1] ??
    xml.match(/<(?:[\w-]+:)?ClaimedSigningTime[^>]*>([^<]+)</i)?.[1];
  const signedAt = signingTime ? parseForgeDate(signingTime.trim()) : null;

  const certMatches = [...xml.matchAll(/<(?:[\w-]+:)?X509Certificate[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?X509Certificate>/gi)];
  for (const m of certMatches) {
    try {
      const b64 = m[1].replace(/\s/g, "");
      const der = forge.util.decode64(b64);
      const asn1 = forge.asn1.fromDer(der);
      const cert = forge.pki.certificateFromAsn1(asn1);
      result.signers.push(signerFromCert(cert, signedAt));
    } catch {
      result.warnings.push("Jeden certifikát v XML se nepodařilo načíst.");
    }
  }

  const sigMethod = xml.match(/SignatureMethod[^>]*Algorithm="([^"]+)"/)?.[1];
  if (sigMethod) result.details.push(`Algoritmus: ${sigMethod.split("#").pop()}`);

  if (signedAt) result.details.push(`Čas podpisu: ${signedAt}`);

  result.warnings.push(
    "XML podpis — zobrazena metadata certifikátu; plné XAdES ověření vyžaduje canonicalizaci celého dokumentu."
  );

  return result;
}

export function detectSignatureFileKind(
  fileName: string,
  buffer: Buffer
): "p7s" | "pdf" | "xml" | "unknown" {
  const lower = fileName.toLowerCase();
  if (
    lower.endsWith(".p7s") ||
    lower.endsWith(".p7m") ||
    lower.endsWith(".pkcs7") ||
    lower.endsWith(".pem")
  ) {
    return "p7s";
  }
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".xml") || lower.endsWith(".xades")) return "xml";
  if (buffer.slice(0, 5).toString("utf8") === "%PDF-") return "pdf";
  if (buffer.slice(0, 100).toString("utf8").trimStart().startsWith("<")) return "xml";
  return "unknown";
}

export function verifySignatureFile(
  buffer: Buffer,
  fileName: string
): SignatureVerifyResult {
  const kind = detectSignatureFileKind(fileName, buffer);

  switch (kind) {
    case "p7s":
      return parsePkcs7Buffer(buffer, { fileName });
    case "pdf":
      return parsePdfBuffer(buffer, fileName);
    case "xml":
      return parseXmlBuffer(buffer, fileName);
    default:
      return {
        fileName,
        fileKind: "unknown",
        formatLabel: "Neznámý formát",
        signed: false,
        cryptographicallyValid: null,
        signers: [],
        subFilter: null,
        warnings: ["Podporované formáty: PDF, XML (XAdES), P7S/PKCS7."],
        errors: [],
        details: [],
      };
  }
}
