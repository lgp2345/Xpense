import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

import { ServerConfigService } from "../../config/config.service.js";
import type {
  RentalSensitiveIdentity,
  RentalTenantDocumentIdentity,
} from "./tenant-identity.types.js";

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;
const MIN_CIPHERTEXT_BYTES = HEADER_BYTES + 1;

/** 加密租户敏感身份资料，并生成不可逆的组织作用域证件检索摘要。 */
@Injectable()
export class TenantIdentityCryptoService {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(config: ServerConfigService) {
    this.encryptionKey = config.env.RENTAL_PII_ENCRYPTION_KEY;
    this.lookupKey = config.env.RENTAL_PII_LOOKUP_KEY;
  }

  lookupHash(organizationId: string, identity: RentalTenantDocumentIdentity): string {
    const countryCode = identity.countryCode.trim().toUpperCase();
    const type = identity.type.trim().toLowerCase();
    const documentNumber = normalizeDocumentNumber(countryCode, type, identity.documentNumber);

    return createHmac("sha256", this.lookupKey)
      .update(`${organizationId}\u0000${countryCode}\u0000${type}\u0000${documentNumber}`)
      .digest("hex");
  }

  encrypt(identity: RentalSensitiveIdentity): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(identity), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([Buffer.from([VERSION]), iv, tag, encrypted]);
  }

  decrypt(ciphertext: Buffer): RentalSensitiveIdentity {
    if (ciphertext.length < MIN_CIPHERTEXT_BYTES) {
      throw new Error("Rental tenant identity ciphertext is too short");
    }

    try {
      if (ciphertext[0] !== VERSION) {
        throw new Error("Invalid rental tenant identity ciphertext");
      }

      const iv = ciphertext.subarray(1, 1 + IV_BYTES);
      const tag = ciphertext.subarray(1 + IV_BYTES, HEADER_BYTES);
      const encrypted = ciphertext.subarray(HEADER_BYTES);
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        "utf8",
      );

      return parseRentalSensitiveIdentity(plaintext);
    } catch {
      throw new Error("Unable to decrypt rental tenant identity");
    }
  }
}

/** 统一证件号码的空白与大小写，供检索摘要和展示脱敏复用。 */
export function normalizeDocumentNumber(countryCode: string, type: string, value: string): string {
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  const normalizedType = type.trim().toLowerCase();
  const normalizedValue = value.trim().replace(/\s+/g, "").toUpperCase();

  if (
    normalizedCountryCode.length === 0 ||
    normalizedType.length === 0 ||
    normalizedValue.length === 0
  ) {
    throw new Error("Document identity must not be empty");
  }

  return normalizedValue;
}

/** 展示证件号码时仅保留长度足够号码的末四位。 */
export function maskDocumentNumber(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
}

function parseRentalSensitiveIdentity(value: string): RentalSensitiveIdentity {
  const parsed: unknown = JSON.parse(value);
  if (!isRentalSensitiveIdentity(parsed)) {
    throw new Error("Invalid rental tenant identity payload");
  }

  return parsed;
}

function isRentalSensitiveIdentity(value: unknown): value is RentalSensitiveIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const identity = value as Record<string, unknown>;
  const fields = ["documentNumber", "birthDate", "gender", "ethnicity", "documentAddress"] as const;
  return fields.every((field) => identity[field] === null || typeof identity[field] === "string");
}
