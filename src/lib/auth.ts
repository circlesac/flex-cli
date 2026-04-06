import { Database } from "bun:sqlite";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { copyFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { FlexCredentials } from "../types/index.ts";
import { AuthError } from "./errors.ts";

const COOKIES_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "Comet",
  "Default",
  "Cookies",
);

function getKeychainPassword(): string {
  try {
    const output = execSync(
      'security find-generic-password -s "Comet Safe Storage" -g 2>&1',
      { encoding: "utf-8" },
    );
    const match = output.match(/password:\s*"([^"]+)"/);
    if (!match?.[1]) {
      throw new Error("Could not parse keychain password");
    }
    return match[1];
  } catch (error) {
    throw new AuthError(
      "Failed to read Comet Safe Storage from Keychain. Is Comet installed?",
    );
  }
}

function deriveKey(keychainPassword: string): Buffer {
  return pbkdf2Sync(
    keychainPassword,
    "saltysalt",
    1003,
    16,
    "sha1",
  );
}

function decryptCookie(encrypted: Buffer, key: Buffer): string {
  if (!encrypted || encrypted.length === 0) {
    return "";
  }

  // Check for v10 prefix
  const prefix = encrypted.subarray(0, 3).toString("utf-8");
  if (prefix !== "v10") {
    return encrypted.toString("utf-8");
  }

  // Strip v10 prefix
  const payload = encrypted.subarray(3);

  // AES-128-CBC with IV = 16 spaces
  const iv = Buffer.from(" ".repeat(16), "utf-8");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(payload),
    decipher.final(),
  ]);

  // Remove PKCS7 padding
  const padByte = decrypted[decrypted.length - 1]!;
  let unpadded: Buffer;
  if (padByte > 0 && padByte <= 16) {
    unpadded = decrypted.subarray(0, decrypted.length - padByte);
  } else {
    unpadded = decrypted;
  }

  // Skip first 32 bytes (nonce/metadata)
  return unpadded.subarray(32).toString("utf-8");
}

function parseJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new AuthError("Invalid JWT format in AID cookie");
  }
  const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
  return JSON.parse(payload) as Record<string, unknown>;
}

export async function extractCometCookies(): Promise<FlexCredentials> {
  // Get keychain password and derive key
  const keychainPassword = getKeychainPassword();
  const key = deriveKey(keychainPassword);

  // Copy cookies DB to temp file (avoid locking)
  const tmpPath = join(tmpdir(), `flex-cookies-${Date.now()}.db`);
  try {
    copyFileSync(COOKIES_PATH, tmpPath);
  } catch {
    throw new AuthError(
      `Cannot read Comet cookies at ${COOKIES_PATH}. Is Comet installed?`,
    );
  }

  let cookies: Record<string, string>;
  try {
    const db = new Database(tmpPath, { readonly: true });
    const rows = db
      .query<
        { name: string; encrypted_value: Buffer },
        []
      >("SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%flex.team%'")
      .all();
    db.close();

    cookies = {};
    for (const row of rows) {
      cookies[row.name] = decryptCookie(Buffer.from(row.encrypted_value), key);
    }
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  }

  const jsessionid = cookies["JSESSIONID"];
  const aid = cookies["AID"];
  const deviceId = cookies["DEVICE_ID"];

  if (!jsessionid || !aid || !deviceId) {
    const missing = [];
    if (!jsessionid) missing.push("JSESSIONID");
    if (!aid) missing.push("AID");
    if (!deviceId) missing.push("DEVICE_ID");
    throw new AuthError(
      `Missing cookies: ${missing.join(", ")}. Log in to flex.team in Comet first.`,
    );
  }

  // Parse JWT to get customerUuid and exp
  const payload = parseJwtPayload(aid);
  const customerUuid = payload["customerUuid"] as string | undefined;
  const exp = payload["exp"] as number | undefined;

  if (!customerUuid || !exp) {
    throw new AuthError("AID JWT is missing customerUuid or exp fields");
  }

  return { jsessionid, aid, deviceId, customerUuid, exp };
}
