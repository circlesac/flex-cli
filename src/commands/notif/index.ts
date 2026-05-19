import { defineCommand } from "citty";
import { notifCountCommand } from "./count.ts";
import { notifListCommand } from "./list.ts";
import { notifReadCommand } from "./read.ts";

export const notifCommand = defineCommand({
  meta: {
    name: "notif",
    description: "Notifications inbox",
  },
  subCommands: {
    count: notifCountCommand,
    list: notifListCommand,
    read: notifReadCommand,
  },
});
