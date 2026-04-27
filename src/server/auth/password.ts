import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith("scrypt:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    const salt = Buffer.from(parts[1], "hex");
    const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
    const stored = Buffer.from(parts[2], "hex");
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
  }
  const legacyHash = createHash("sha256").update(password).digest("hex");
  return legacyHash === storedHash;
}
