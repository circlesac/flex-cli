import { defineCommand } from "citty";
import { docsListCommand } from "./list.ts";
import { docsGetCommand } from "./get.ts";
import { docsTemplatesCommand } from "./templates.ts";
import { docsSubmitCommand } from "./submit.ts";
import { docsDeleteCommand } from "./delete.ts";

export const docsCommand = defineCommand({
  meta: {
    name: "docs",
    description: "Approval documents",
  },
  subCommands: {
    list: docsListCommand,
    get: docsGetCommand,
    templates: docsTemplatesCommand,
    submit: docsSubmitCommand,
    delete: docsDeleteCommand,
  },
});
