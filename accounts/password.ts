/**
 * Hash de contraseñas: argon2id (@noble/hashes, sin nativo).
 */

import { argon2id } from "@noble/hashes/argon2.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";

const TIME = Number(process.env.ABS_ARGON2_TIME ?? 3);
/** En prod 64 MiB; en test/dev menos para no tumbar la suite. */
const MEM_KIB = Number(
  process.env.ABS_ARGON2_MEM_KIB ??
    ((process.env.ABS_ENV === "production" ||
    process.env.NODE_ENV === "production"
      ? 64 * 1024
      : 8 * 1024)),
);
const PARALLELISM = 1;
const HASH_LEN = 32;
const SALT_LEN = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = argon2id(password, salt, {
    t: TIME,
    m: MEM_KIB,
    p: PARALLELISM,
    dkLen: HASH_LEN,
  });
  return `argon2id$v=19$m=${MEM_KIB},t=${TIME},p=${PARALLELISM}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[0] !== "argon2id") return false;
  const salt = hexToBytes(parts[3]!);
  const expected = parts[4]!;
  const hash = argon2id(password, salt, {
    t: TIME,
    m: MEM_KIB,
    p: PARALLELISM,
    dkLen: HASH_LEN,
  });
  const got = bytesToHex(hash);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function hashToken(token: string): string {
  const salt = new Uint8Array(16);
  const hash = argon2id(token, salt, {
    t: 2,
    m: 16 * 1024,
    p: 1,
    dkLen: 32,
  });
  return bytesToHex(hash);
}

export function randomToken(bytes = 32): string {
  return bytesToHex(randomBytes(bytes));
}
