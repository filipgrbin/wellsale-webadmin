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
