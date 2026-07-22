import { defineCommand } from "citty";
import { docsCommentListCommand } from "./list.ts";
import { docsCommentAddCommand } from "./add.ts";
import { docsCommentEditCommand } from "./edit.ts";
import { docsCommentRmCommand } from "./rm.ts";

export const docsCommentCommand = defineCommand({
  meta: {
    name: "comment",
    description: "List, add, edit, or delete approval-document comments",
  },
  subCommands: {
    list: docsCommentListCommand,
    add: docsCommentAddCommand,
    edit: docsCommentEditCommand,
    rm: docsCommentRmCommand,
  },
});
