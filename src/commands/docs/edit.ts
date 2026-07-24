import { defineCommand } from "citty";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { requireCredentials } from "../../lib/credentials.ts";
import { getDocument, editDocument } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

/** Insert an <img> into the first empty rich-text table cell
 *  (`<td ...><br></td>`), matching Flex's froala image markup. Used to fill
 *  a blank evidence cell (e.g. "검진확인증") that a reviewer flagged. */
function fillFirstEmptyCell(content: string, imageUrl: string): string {
  const img = `<img src="${imageUrl}" style="width: 100%;" class="fr-fic fr-dii">`;
  const replaced = content.replace(
    /(<td[^>]*>)\s*<br\s*\/?>\s*(<\/td>)/i,
    `$1${img}$2`,
  );
  if (replaced === content) {
    throw new Error(
      "No empty table cell (<td><br></td>) found to place the image. Use --content-file to set the body directly.",
    );
  }
  return replaced;
}

export const docsEditCommand = defineCommand({
  meta: {
    name: "edit",
    description:
      "Edit an in-progress approval document's body in place (keeps existing approvals). Fill a blank evidence cell with --attach-image, or replace the body with --content-file.",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Document key",
      required: true,
    },
    "attach-image": {
      type: "string",
      description:
        "Permanent Flex file URL (from `flexhr upload`) to place in the first empty table cell",
    },
    "content-file": {
      type: "string",
      description: "Replace the document body with the HTML in this file",
    },
    "dry-run": {
      type: "boolean",
      description: "Build and print the payload without submitting the edit",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();

      if (!args["attach-image"] && !args["content-file"]) {
        throw new Error("Provide --attach-image <url> or --content-file <path>");
      }

      const resp = (await getDocument(creds, args.documentKey)) as {
        document: {
          templateKey: string;
          title: string;
          content: string;
          inputs: Array<{ value: string; inputField: { idHash: string } }>;
          attachments?: unknown[];
        };
      };
      const doc = resp.document;

      // 1. Compute new body content
      let content = doc.content ?? "";
      if (args["content-file"]) {
        const p = resolve(args["content-file"]);
        if (!existsSync(p)) throw new Error(`content-file not found: ${p}`);
        content = readFileSync(p, "utf-8");
      }
      if (args["attach-image"]) {
        content = fillFirstEmptyCell(content, args["attach-image"]);
      }

      // 2. PUT only the `document` — the approval line is locked once
      //    submitted. Sending `approvalProcess` (even verbatim, or with a
      //    fresh resolve-policy matchingData) is rejected with APPROVAL_400_028
      //    "변경될 수 없는 승인라인이에요". Editing content this way keeps the
      //    existing approvals intact (no 재상신 / no step reset). Inputs are
      //    echoed back as-is from the GET shape.
      const inputs = doc.inputs.map((i) => ({
        inputFieldIdHash: i.inputField.idHash,
        value: i.value,
      }));
      const payload = {
        document: {
          templateKey: doc.templateKey,
          title: doc.title,
          content,
          inputs,
          attachments: doc.attachments ?? [],
        },
      };

      const format = getOutputFormat(args);

      if (args["dry-run"]) {
        console.error("\x1b[33mdry-run: edit not submitted\x1b[0m");
        printOutput(
          { documentKey: args.documentKey, contentLength: content.length, payload },
          format,
        );
        return;
      }

      // 4. PUT the edit (재상신)
      await editDocument(creds, args.documentKey, payload);

      // 5. Verify by re-fetching
      const after = (await getDocument(creds, args.documentKey)) as {
        document: { code?: string; status?: string; content?: string };
      };
      const embedded = args["attach-image"]
        ? (after.document.content ?? "").includes(args["attach-image"])
        : true;
      printOutput(
        {
          documentKey: args.documentKey,
          code: after.document.code ?? "-",
          status: after.document.status ?? "-",
          imageEmbedded: embedded,
        },
        format,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
