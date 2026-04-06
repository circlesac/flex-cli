import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { getTemplates } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

export const docsTemplatesCommand = defineCommand({
  meta: {
    name: "templates",
    description: "List available document templates",
  },
  args: {
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const templates = await getTemplates(creds);

      const format = getOutputFormat(args);

      const rows = (Array.isArray(templates) ? templates : []).map((t) => ({
        templateKey: t.templateKey,
        name: t.name,
      }));

      console.error(`\x1b[2m${rows.length} templates\x1b[0m`);
      printOutput(rows, format, [
        { key: "templateKey", label: "Template Key" },
        { key: "name", label: "Name" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
