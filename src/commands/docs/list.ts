import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { searchDocuments } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";
import type { DocumentSearchItem } from "../../types/index.ts";

function flattenDoc(d: DocumentSearchItem) {
  const doc = d.document;
  return {
    code: doc.code ?? "-",
    title: doc.title,
    status: doc.status,
    updated: doc.lastUpdatedAt?.slice(0, 10) ?? doc.writtenAt?.slice(0, 10) ?? "-",
  };
}

export const docsListCommand = defineCommand({
  meta: {
    name: "list",
    description: "Search approval documents",
  },
  args: {
    status: {
      type: "string",
      description: "Filter by status: IN_PROGRESS or DONE (default: IN_PROGRESS)",
    },
    template: {
      type: "string",
      description: "Filter by templateKey",
    },
    keyword: {
      type: "string",
      description: "Search keyword",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();

      const statuses = args.status ? [args.status] : ["IN_PROGRESS"];
      const templateKeys = args.template ? [args.template] : [];

      const resp = await searchDocuments(
        creds,
        { statuses, templateKeys },
        { keyword: args.keyword ?? "" },
      );

      const format = getOutputFormat(args);
      const rows = resp.documents.map(flattenDoc);

      console.error(`\x1b[2m${resp.total} documents\x1b[0m`);
      printOutput(rows, format, [
        { key: "code", label: "Code" },
        { key: "title", label: "Title" },
        { key: "status", label: "Status" },
        { key: "updated", label: "Updated" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
