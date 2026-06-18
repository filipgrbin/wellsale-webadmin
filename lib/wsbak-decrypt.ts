// WSBAK Decryption Utility
// Binary layout:
// 0-8:    Magic "WSBAK\x01\x00\x00"
// 8-24:   Salt (16 bytes)
// 24-36:  IV/Nonce (12 bytes)
// 36-N:   Ciphertext (AES-256-GCM)
// N-16:   GCM Auth Tag (16 bytes)

const MAGIC = new Uint8Array([0x57, 0x53, 0x42, 0x41, 0x4b, 0x01, 0x00, 0x00]); // "WSBAK\x01\x00\x00"

export interface DecryptedBackup {
  success: boolean;
  error?: string;
  data?: Uint8Array;
}

export async function decryptWsbak(
  encryptedData: ArrayBuffer,
  licenseKey: string
): Promise<DecryptedBackup> {
  try {
    const bytes = new Uint8Array(encryptedData);
    
    // Verify magic header
    for (let i = 0; i < MAGIC.length; i++) {
      if (bytes[i] !== MAGIC[i]) {
        return { success: false, error: "Invalid file format - bad magic header" };
      }
    }
    
    if (bytes.length < 36 + 16) {
      return { success: false, error: "File too small to be valid" };
    }
    
    // Extract components
    const salt = bytes.slice(8, 24);           // 16 bytes
    const iv = bytes.slice(24, 36);            // 12 bytes
    const ciphertext = bytes.slice(36, bytes.length - 16);
    const tag = bytes.slice(bytes.length - 16); // 16 bytes
    
    // Derive key using PBKDF2
    const passphrase = `wellsale-backup:${licenseKey}`;
    const passphraseBytes = new TextEncoder().encode(passphrase);
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passphraseBytes,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    
    // Combine ciphertext and tag for WebCrypto (it expects them together)
    const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
    ciphertextWithTag.set(ciphertext, 0);
    ciphertextWithTag.set(tag, ciphertext.length);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128,
      },
      key,
      ciphertextWithTag
    );
    
    return { success: true, data: new Uint8Array(decrypted) };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Decryption failed" 
    };
  }
}
