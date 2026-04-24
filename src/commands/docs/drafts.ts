import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { listDrafts } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

export const docsDraftsCommand = defineCommand({
  meta: {
    name: "drafts",
    description: "List current user's draft approval documents",
  },
  args: {
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const drafts = await listDrafts(creds);

      const format = getOutputFormat(args);
      const rows = drafts.map((d) => ({
        documentKey: d.document.documentKey,
        title: d.document.title,
        templateKey: d.document.templateKey,
        updated: d.lastModifiedAt?.slice(0, 10) ?? "-",
      }));

      console.error(`\x1b[2m${rows.length} drafts\x1b[0m`);
      printOutput(rows, format, [
        { key: "documentKey", label: "DocumentKey" },
        { key: "title", label: "Title" },
        { key: "templateKey", label: "Template" },
        { key: "updated", label: "Updated" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
