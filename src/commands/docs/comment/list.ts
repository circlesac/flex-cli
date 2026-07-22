import { defineCommand } from "citty";
import { requireCredentials } from "../../../lib/credentials.ts";
import { getDocument } from "../../../lib/client.ts";
import { commonArgs } from "../../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../../lib/output.ts";
import { handleError } from "../../../lib/errors.ts";
import { extractComments } from "./common.ts";

export const docsCommentListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List comments on an approval document (idHash for edit/rm)",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Document key",
      required: true,
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const resp = await getDocument(creds, args.documentKey);
      const comments = extractComments(resp);
      const format = getOutputFormat(args);

      if (format === "json") {
        printOutput(comments, format);
        return;
      }

      if (comments.length === 0) {
        console.log("No comments.");
        return;
      }

      const rows = comments.map((c) => {
        const full = (c.content ?? "").trim();
        const oneLine = full.replace(/\s+/g, " ");
        const text = oneLine
          ? oneLine.length > 80
            ? oneLine.slice(0, 79) + "…"
            : oneLine
          : c.writtenBySystem
            ? "(system)"
            : "";
        return {
          idHash: c.idHash ?? "-",
          type: c.type ?? "-",
          writer: c.writer?.name ?? "-",
          date: (c.updatedAt ?? c.createdAt ?? "").slice(0, 16).replace("T", " "),
          text,
        };
      });

      printOutput(rows, format, [
        { key: "idHash", label: "idHash" },
        { key: "type", label: "Type" },
        { key: "writer", label: "Writer" },
        { key: "date", label: "Date" },
        { key: "text", label: "Text" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
