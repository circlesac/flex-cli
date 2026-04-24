import { defineCommand } from "citty";
import { resolve, basename, extname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { requireCredentials } from "../lib/credentials.ts";
import {
  requestPresignedUrl,
  uploadToPresignedUrl,
  verifyTemporaryFile,
  convertTemporaryToContentFile,
} from "../lib/client.ts";
import { commonArgs } from "../lib/args.ts";
import { printOutput, getOutputFormat } from "../lib/output.ts";
import { handleError } from "../lib/errors.ts";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

function guessMime(path: string): string {
  const ext = extname(path).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export const uploadCommand = defineCommand({
  meta: {
    name: "upload",
    description:
      "Upload a file (pre-signed S3 → verify → approval-document content file). Prints the permanent URL.",
  },
  args: {
    file: {
      type: "positional",
      description: "Path to the file",
      required: true,
    },
    mime: {
      type: "string",
      description: "Override MIME type (auto-detected from extension)",
    },
    source: {
      type: "string",
      description:
        "sourceType for flex (default: WORKFLOW_IN_EDITOR_FILE; used by approval-document rich editor)",
    },
    "no-convert": {
      type: "boolean",
      description:
        "Skip the approval-document content convert step. Outputs only the temporary fileKey.",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();

      const filePath = resolve(args.file);
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stat = statSync(filePath);
      const name = basename(filePath);
      const mimeType = args.mime ?? guessMime(filePath);

      console.error(
        `\x1b[2m${name} (${stat.size.toLocaleString()} bytes, ${mimeType})\x1b[0m`,
      );

      console.error("\x1b[2m→ requesting pre-signed URL\x1b[0m");
      const presigned = await requestPresignedUrl(creds, {
        name,
        size: stat.size,
        mimeType,
        sourceType: args.source,
      });

      console.error("\x1b[2m→ uploading to S3\x1b[0m");
      const data = await Bun.file(filePath).arrayBuffer();
      await uploadToPresignedUrl(presigned.uploadUrl, data, mimeType);

      console.error("\x1b[2m→ verifying\x1b[0m");
      await verifyTemporaryFile(creds, presigned.fileKey);

      const format = getOutputFormat(args);

      if (args["no-convert"]) {
        printOutput(
          {
            temporaryFileKey: presigned.fileKey,
            size: presigned.size,
            mimeType: presigned.mimeType,
          },
          format,
        );
        return;
      }

      console.error("\x1b[2m→ converting to approval-document content file\x1b[0m");
      const permanent = await convertTemporaryToContentFile(
        creds,
        presigned.fileKey,
      );

      printOutput(
        {
          url: permanent.url,
          fileKey: permanent.fileKey,
        },
        format,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
