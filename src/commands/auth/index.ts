import { defineCommand } from "citty";
import { loginCommand } from "./login.ts";
import { statusCommand } from "./status.ts";
import { logoutCommand } from "./logout.ts";

export const authCommand = defineCommand({
  meta: {
    name: "auth",
    description: "Manage Flex authentication",
  },
  subCommands: {
    login: loginCommand,
    status: statusCommand,
    logout: logoutCommand,
  },
});
