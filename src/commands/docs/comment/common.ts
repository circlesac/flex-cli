import { readFileSync } from "node:fs";

export interface DocComment {
  idHash?: string;
  identifier?: string;
  type?: string;
  content?: string;
  writtenBySystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
  writer?: { name?: string };
}

/** Pull the comment list out of a `getDocument` response. */
export function extractComments(resp: unknown): DocComment[] {
  const doc = (resp as { document?: { comments?: DocComment[] } }).document;
  return doc?.comments ?? [];
}

/** Resolve comment text from --body, --body-file, or piped stdin (in that
 *  order). Trailing whitespace is trimmed; internal newlines are kept. */
export async function resolveBody(
  body: string | undefined,
  bodyFile: string | undefined,
): Promise<string> {
  let text: string | undefined;
  if (body !== undefined && body !== "") {
    text = body;
  } else if (bodyFile) {
    text = readFileSync(bodyFile, "utf-8");
  } else if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const s = Buffer.concat(chunks).toString("utf-8");
    if (s.trim()) text = s;
  }
  if (text === undefined) {
    throw new Error(
      "No comment body. Provide --body <text>, --body-file <path>, or pipe text via stdin.",
    );
  }
  const trimmed = text.replace(/\s+$/, "");
  if (!trimmed) throw new Error("Comment body is empty.");
  return trimmed;
}
