import { defineCommand } from "citty";
import { requireCredentials } from "../../../lib/credentials.ts";
import { updateComment } from "../../../lib/client.ts";
import { handleError } from "../../../lib/errors.ts";
import { resolveBody } from "./common.ts";

export const docsCommentEditCommand = defineCommand({
  meta: {
    name: "edit",
    description:
      "Edit a comment (--body, --body-file, or stdin). commentId = idHash from `comment list`",
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
    body: { type: "string", description: "New comment text" },
    "body-file": { type: "string", description: "Read comment text from a file" },
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const content = await resolveBody(args.body, args["body-file"]);

      await updateComment(creds, args.documentKey, args.commentId, content);

      const snippet = content.split("\n")[0]!.slice(0, 60);
      console.log(
        `\x1b[32m✓\x1b[0m comment ${args.commentId} updated: ${snippet}${
          content.length > snippet.length ? "…" : ""
        }`,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
