import { defineCommand } from "citty";
import { requireCredentials } from "../../../lib/credentials.ts";
import { createComment, getDocument } from "../../../lib/client.ts";
import { handleError } from "../../../lib/errors.ts";
import { extractComments, resolveBody } from "./common.ts";

export const docsCommentAddCommand = defineCommand({
  meta: {
    name: "add",
    description:
      "Add a comment to an approval document (--body, --body-file, or stdin)",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Document key",
      required: true,
    },
    body: { type: "string", description: "Comment text" },
    "body-file": { type: "string", description: "Read comment text from a file" },
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const content = await resolveBody(args.body, args["body-file"]);

      await createComment(creds, args.documentKey, content);

      // Verify by re-fetching: surface the new comment's idHash so it can
      // later be edited/removed.
      const comments = extractComments(await getDocument(creds, args.documentKey));
      const mine = comments.filter((c) => !c.writtenBySystem);
      const added = mine[mine.length - 1];
      const snippet = content.split("\n")[0]!.slice(0, 60);
      console.log(
        `\x1b[32m✓\x1b[0m comment added${
          added?.idHash ? ` (idHash ${added.idHash})` : ""
        }: ${snippet}${content.length > snippet.length ? "…" : ""}`,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
