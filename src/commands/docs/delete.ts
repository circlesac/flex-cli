import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { deleteDraft } from "../../lib/client.ts";
import { handleError } from "../../lib/errors.ts";

export const docsDeleteCommand = defineCommand({
  meta: {
    name: "delete",
    description: "Delete a draft approval document (by documentKey)",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Draft documentKey to delete",
      required: true,
    },
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      await deleteDraft(creds, args.documentKey);
      console.log(
        `\x1b[32m✓\x1b[0m draft deleted: ${args.documentKey}`,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
