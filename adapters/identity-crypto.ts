/**
 * Cifrado AES-256-GCM de datos personales de Parte (compartido por los
 * almacenes de identidad PostgreSQL y SQLite).
 * Clave: ABS_IDENTITY_KEY (32 bytes hex o ≥32 chars).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { PartePersonalData } from "../policies/identity.js";

function loadKey(): Buffer {
  const raw = process.env.ABS_IDENTITY_KEY;
  if (!raw || raw.length < 32) {
    if (process.env.ABS_ENV === "production" || process.env.NODE_ENV === "production") {
      throw new Error("ABS_IDENTITY_KEY (≥32 chars) obligatorio en producción");
    }
    // Derivada (32 bytes exactos); solo para desarrollo y tests.
    return createHash("sha256").update("abs-dev-only-identity-key").digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return Buffer.from(raw.slice(0, 32), "utf8");
}

export function sealPersonal(plain: PartePersonalData): {
  ciphertext: Buffer;
  nonce: Buffer;
} {
  const key = loadKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(plain), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), nonce };
}

export function openPersonal(
  ciphertext: Buffer,
  nonce: Buffer,
): PartePersonalData {
  const key = loadKey();
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
  return JSON.parse(plain) as PartePersonalData;
}
