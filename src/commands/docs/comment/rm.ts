import { defineCommand } from "citty";
import { requireCredentials } from "../../../lib/credentials.ts";
import { deleteComment } from "../../../lib/client.ts";
import { handleError } from "../../../lib/errors.ts";

export const docsCommentRmCommand = defineCommand({
  meta: {
    name: "rm",
    description: "Delete a comment. commentId = idHash from `comment list`",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Document key",
      required: true,
    },
    commentId: {
      type: "positional",
      description: "Comment idHash (see `docs comment list`)",
      required: true,
    },
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      await deleteComment(creds, args.documentKey, args.commentId);
      console.log(`\x1b[32m✓\x1b[0m comment ${args.commentId} deleted`);
    } catch (error) {
      handleError(error);
    }
  },
});
