import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { getNotificationUnreadCount } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

export const notifCountCommand = defineCommand({
  meta: {
    name: "count",
    description: "Show unread notification count",
  },
  args: {
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const resp = await getNotificationUnreadCount(creds);
      const format = getOutputFormat(args);
      if (format === "table") {
        console.log(String(resp.unreadCount));
      } else {
        printOutput(resp, format);
      }
    } catch (error) {
      handleError(error);
    }
  },
});
