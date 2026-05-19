import { defineCommand } from "citty";
import { notificationsCountCommand } from "./count.ts";
import { notificationsListCommand } from "./list.ts";
import { notificationsReadCommand } from "./read.ts";

export const notificationsCommand = defineCommand({
  meta: {
    name: "notifications",
    description: "Notifications inbox",
  },
  subCommands: {
    count: notificationsCountCommand,
    list: notificationsListCommand,
    read: notificationsReadCommand,
  },
});
