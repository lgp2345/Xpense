import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  maskDocumentNumber,
  normalizeDocumentNumber,
  TenantIdentityCryptoService,
} from "./tenant-identity-crypto.service.js";

const encryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const lookupKey = "ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=";

const identity = {
  documentNumber: "440300199001011234",
  birthDate: "1990-01-01",
  gender: "female" as const,
  ethnicity: "汉",
  documentAddress: "深圳市南山区科技园 1 号",
};

function createService() {
  return new TenantIdentityCryptoService({
    env: {
      RENTAL_PII_ENCRYPTION_KEY: Buffer.from(encryptionKey, "base64"),
      RENTAL_PII_LOOKUP_KEY: Buffer.from(lookupKey, "base64"),
    },
  } as never);
}

function encryptRawPayload(payload: string): Buffer {
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "base64"), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}

describe("TenantIdentityCryptoService", () => {
  it("encrypts with a fresh IV and decrypts the original identity", () => {
    const crypto = createService();

    const first = crypto.encrypt(identity);
    const second = crypto.encrypt(identity);

    expect(first.equals(second)).toBe(false);
    expect(crypto.decrypt(first)).toEqual(identity);
    expect(crypto.decrypt(second)).toEqual(identity);
  });

  it("uses an organization-scoped lookup hash for normalized document numbers", () => {
    const crypto = createService();
    const document = {
      countryCode: "cn",
      type: "national_id" as const,
      documentNumber: " 440300 19900101 1234 ",
    };

    expect(normalizeDocumentNumber("CN", "national_id", document.documentNumber)).toBe(
      "440300199001011234",
    );
    expect(crypto.lookupHash("organization-a", document)).toBe(
      crypto.lookupHash("organization-a", {
        ...document,
        countryCode: "CN",
        documentNumber: "440300199001011234",
      }),
    );
    expect(crypto.lookupHash("organization-a", document)).not.toBe(
      crypto.lookupHash("organization-b", document),
    );
  });

  it("masks every document character except its final four characters", () => {
    expect(maskDocumentNumber("440300199001011234")).toBe("**************1234");
    expect(maskDocumentNumber("1234")).toBe("****");
  });

  it("rejects malformed, unauthenticated, and unsupported ciphertext", () => {
    const crypto = createService();
    const ciphertext = crypto.encrypt(identity);
    const invalidTag = Buffer.from(ciphertext);
    invalidTag[13] = (invalidTag[13] ?? 0) ^ 1;
    const invalidJson = encryptRawPayload("not-json");

    expect(() => crypto.decrypt(Buffer.alloc(29))).toThrow(
      "Rental tenant identity ciphertext is too short",
    );
    expect(() => crypto.decrypt(Buffer.from([2, ...ciphertext.subarray(1)]))).toThrow();
    expect(() => crypto.decrypt(invalidTag)).toThrow();
    expect(() => crypto.decrypt(invalidJson)).toThrow();
  });
});
