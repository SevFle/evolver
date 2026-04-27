import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const HEX_REGEX = /^[a-f0-9]+$/;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("scrypt:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    if (!HEX_REGEX.test(parts[1]) || !HEX_REGEX.test(parts[2])) return false;
    const salt = Buffer.from(parts[1], "hex");
    const derived = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
    const stored = Buffer.from(parts[2], "hex");
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
  }
  const legacyHash = createHash("sha256").update(password).digest("hex");
  if (legacyHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(legacyHash), Buffer.from(storedHash));
}
