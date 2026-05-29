import { join } from "node:path";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import type { FlexCredentials } from "../types/index.ts";
import { AuthError } from "./errors.ts";

const CONFIG_DIR = join(homedir(), ".config", "flex");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function storeCredentials(creds: FlexCredentials): Promise<void> {
  await ensureConfigDir();
  await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + "\n");
}

export async function loadCredentials(): Promise<FlexCredentials | null> {
  try {
    const content = await readFile(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(content) as FlexCredentials;
  } catch {
    return null;
  }
}

export async function removeCredentials(): Promise<boolean> {
  try {
    await unlink(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function requireCredentials(): Promise<FlexCredentials> {
  const creds = await loadCredentials();
  if (!creds) {
    throw new AuthError(
      'Not authenticated. Run "flexhr auth login" to extract cookies from your default browser.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (creds.exp <= now) {
    throw new AuthError(
      "AID token has expired. Log in to flex.team in your browser, then run \"flexhr auth login\" again.",
    );
  }

  const daysRemaining = (creds.exp - now) / 86400;
  if (daysRemaining < 7) {
    console.error(
      `\x1b[33m⚠\x1b[0m AID token expires in ${Math.floor(daysRemaining)} days. Consider re-authenticating soon.`,
    );
  }

  return creds;
}
