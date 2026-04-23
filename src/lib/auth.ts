import { Database } from "bun:sqlite";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { copyFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import type { FlexCredentials } from "../types/index.ts";
import { AuthError } from "./errors.ts";

interface BrowserConfig {
  name: string;
  keychainService: string;
  cookiesPath: string;
  bundleIds: string[];
}

const BROWSERS: BrowserConfig[] = [
  {
    name: "Chrome",
    keychainService: "Chrome Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Google", "Chrome", "Default", "Cookies"),
    bundleIds: ["com.google.chrome"],
  },
  {
    name: "Comet",
    keychainService: "Comet Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Comet", "Default", "Cookies"),
    bundleIds: ["ai.perplexity.comet"],
  },
  {
    name: "Arc",
    keychainService: "Arc Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "Cookies"),
    bundleIds: ["company.thebrowser.browser"],
  },
  {
    name: "Edge",
    keychainService: "Microsoft Edge Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Microsoft Edge", "Default", "Cookies"),
    bundleIds: ["com.microsoft.edgemac"],
  },
  {
    name: "Brave",
    keychainService: "Brave Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser", "Default", "Cookies"),
    bundleIds: ["com.brave.browser"],
  },
  {
    name: "Chromium",
    keychainService: "Chromium Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Chromium", "Default", "Cookies"),
    bundleIds: ["org.chromium.chromium"],
  },
];

function getDefaultBrowserBundleId(): string | null {
  const plistPath = join(
    homedir(),
    "Library",
    "Preferences",
    "com.apple.LaunchServices",
    "com.apple.launchservices.secure.plist",
  );
  if (!existsSync(plistPath)) return null;
  try {
    const json = execSync(`plutil -convert json -o - "${plistPath}"`, {
      encoding: "utf-8",
    });
    const data = JSON.parse(json) as {
      LSHandlers?: Array<{
        LSHandlerURLScheme?: string;
        LSHandlerRoleAll?: string;
      }>;
    };
    const handler = data.LSHandlers?.find(
      (h) => h.LSHandlerURLScheme === "https",
    );
    return handler?.LSHandlerRoleAll?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function orderBrowsersByDefault(browsers: BrowserConfig[]): BrowserConfig[] {
  const defaultBundleId = getDefaultBrowserBundleId();
  if (!defaultBundleId) return browsers;
  const match = browsers.find((b) =>
    b.bundleIds.some((id) => id.toLowerCase() === defaultBundleId),
  );
  if (!match) return browsers;
  return [match, ...browsers.filter((b) => b !== match)];
}

function detectBrowserWithFlexCookies(preferredName?: string): {
  browser: BrowserConfig;
  key: Buffer;
} {
  let candidates = BROWSERS.filter((b) => existsSync(b.cookiesPath));

  if (candidates.length === 0) {
    throw new AuthError(
      `No supported Chromium browser found. Checked: ${BROWSERS.map((b) => b.name).join(", ")}`,
    );
  }

  if (preferredName) {
    const forced = candidates.find(
      (b) => b.name.toLowerCase() === preferredName.toLowerCase(),
    );
    if (!forced) {
      throw new AuthError(
        `Browser "${preferredName}" not found or not installed. Available: ${candidates.map((b) => b.name).join(", ")}`,
      );
    }
    const key = getKeychainKey(forced);
    return { browser: forced, key };
  }

  candidates = orderBrowsersByDefault(candidates);

  // Try each browser in order, return first one with flex.team cookies
  for (const browser of candidates) {
    try {
      const key = getKeychainKey(browser);
      const hasCookies = checkFlexCookies(browser, key);
      if (hasCookies) {
        return { browser, key };
      }
    } catch {
      // skip browsers that fail keychain access
    }
  }

  // Fallback to first available
  const browser = candidates[0]!;
  const key = getKeychainKey(browser);
  return { browser, key };
}

function getKeychainKey(browser: BrowserConfig): Buffer {
  try {
    const output = execSync(
      `security find-generic-password -s "${browser.keychainService}" -g 2>&1`,
      { encoding: "utf-8" },
    );
    const match = output.match(/password:\s*"([^"]+)"/);
    if (!match?.[1]) {
      throw new Error("Could not parse keychain password");
    }
    return pbkdf2Sync(match[1], "saltysalt", 1003, 16, "sha1");
  } catch (error) {
    throw new AuthError(
      `Failed to read ${browser.keychainService} from Keychain. Is ${browser.name} installed?`,
    );
  }
}

function checkFlexCookies(browser: BrowserConfig, key: Buffer): boolean {
  const tmpPath = join(tmpdir(), `flex-check-${Date.now()}.db`);
  try {
    copyFileSync(browser.cookiesPath, tmpPath);
    const db = new Database(tmpPath, { readonly: true });
    const row = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM cookies WHERE host_key LIKE '%flex.team%' AND name = 'AID'",
      )
      .get();
    db.close();
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

function decryptCookie(encrypted: Buffer, key: Buffer): string {
  if (!encrypted || encrypted.length === 0) {
    return "";
  }

  const prefix = encrypted.subarray(0, 3).toString("utf-8");
  if (prefix !== "v10") {
    return encrypted.toString("utf-8");
  }

  const payload = encrypted.subarray(3);
  const iv = Buffer.from(" ".repeat(16), "utf-8");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(payload),
    decipher.final(),
  ]);

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

export async function extractBrowserCookies(
  preferredBrowser?: string,
): Promise<FlexCredentials & { browser: string }> {
  const { browser, key } = detectBrowserWithFlexCookies(preferredBrowser);

  // Copy cookies DB to temp file (avoid locking)
  const tmpPath = join(tmpdir(), `flex-cookies-${Date.now()}.db`);
  try {
    copyFileSync(browser.cookiesPath, tmpPath);
  } catch {
    throw new AuthError(
      `Cannot read ${browser.name} cookies at ${browser.cookiesPath}. Is ${browser.name} running?`,
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
    try { unlinkSync(tmpPath); } catch {}
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
      `Missing cookies: ${missing.join(", ")}. Log in to flex.team in ${browser.name} first.`,
    );
  }

  const payload = parseJwtPayload(aid);
  const customerUuid = payload["customerUuid"] as string | undefined;
  const exp = payload["exp"] as number | undefined;

  if (!customerUuid || !exp) {
    throw new AuthError("AID JWT is missing customerUuid or exp fields");
  }

  return { jsessionid, aid, deviceId, customerUuid, exp, browser: browser.name };
}

// Keep backward compat
export const extractCometCookies = extractBrowserCookies;
