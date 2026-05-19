import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import {
  markNotificationsRead,
  getNotificationUnreadCount,
} from "../../lib/client.ts";
import { handleError } from "../../lib/errors.ts";

export const notificationsReadCommand = defineCommand({
  meta: {
    name: "read",
    description:
      "Mark notification topics as read. No args or --all marks all as read; --id <topicId> can be repeated to target specific topics.",
  },
  args: {
    id: {
      type: "string",
      description:
        "Topic ID(s) to mark as read. Repeat for multiple IDs. Without --id, all topics are marked as read.",
    },
    all: {
      type: "boolean",
      description: "Mark all topics as read (default when no --id given)",
    },
  },
  run: async ({ args, rawArgs }) => {
    try {
      const creds = await requireCredentials();

      const ids = rawArgs
        .reduce<string[]>((acc, v, i, arr) => {
          if (v === "--id" && arr[i + 1]) acc.push(arr[i + 1]!);
          else if (v.startsWith("--id=")) acc.push(v.slice("--id=".length));
          return acc;
        }, []);

      const beforeCount = (await getNotificationUnreadCount(creds)).unreadCount;
      await markNotificationsRead(creds, ids.length > 0 ? ids : undefined);
      const afterCount = (await getNotificationUnreadCount(creds)).unreadCount;

      const target =
        ids.length > 0 ? `${ids.length} topic(s)` : args.all ? "all" : "all";
      console.log(
        `\x1b[32m✓\x1b[0m marked ${target} as read (unread: ${beforeCount} → ${afterCount})`,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
