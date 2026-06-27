import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SECRET_PREFIX = "enc:v1:aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encryptWorkspaceSecret(value: string, encryptionKey: string): string {
  const plaintext = value.trim();
  const keyMaterial = encryptionKey.trim();
  if (!plaintext) throw new Error("Workspace secret value is required");
  if (!keyMaterial) throw new Error("Workspace secret encryption key is required");

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(keyMaterial, salt, KEY_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    SECRET_PREFIX,
    salt.toString("base64url"),
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptWorkspaceSecret(value: string, encryptionKey: string): string {
  const keyMaterial = encryptionKey.trim();
  if (!keyMaterial) throw new Error("Workspace secret encryption key is required");

  const parts = value.split(":");
  if (parts.length !== 7 || parts.slice(0, 3).join(":") !== SECRET_PREFIX) {
    throw new Error("Unsupported workspace secret ciphertext");
  }
  const salt = Buffer.from(parts[3], "base64url");
  const iv = Buffer.from(parts[4], "base64url");
  const authTag = Buffer.from(parts[5], "base64url");
  const ciphertext = Buffer.from(parts[6], "base64url");
  const key = scryptSync(keyMaterial, salt, KEY_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncryptedWorkspaceSecret(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 7 && parts.slice(0, 3).join(":") === SECRET_PREFIX;
}
