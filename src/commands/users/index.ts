import { defineCommand } from "citty";
import { listCommand } from "./list.ts";
import { searchCommand } from "./search.ts";

export const usersCommand = defineCommand({
  meta: {
    name: "users",
    description: "List and search Flex users",
  },
  subCommands: {
    list: listCommand,
    search: searchCommand,
  },
});
