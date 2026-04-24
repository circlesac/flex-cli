import { defineCommand, runMain } from "citty";
import { authCommand } from "./commands/auth/index.ts";
import { usersCommand } from "./commands/users/index.ts";
import { userCommand } from "./commands/user.ts";
import { orgCommand } from "./commands/org.ts";
import { docsCommand } from "./commands/docs/index.ts";
import { meCommand } from "./commands/me.ts";
import { uploadCommand } from "./commands/upload.ts";

const main = defineCommand({
  meta: {
    name: "flexhr",
    version: "0.1.0",
    description: "CLI for Flex HR (flex.team)",
  },
  subCommands: {
    auth: authCommand,
    users: usersCommand,
    user: userCommand,
    org: orgCommand,
    docs: docsCommand,
    me: meCommand,
    upload: uploadCommand,
  },
});

runMain(main);
