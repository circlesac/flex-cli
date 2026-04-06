import { defineCommand } from "citty";
import { requireCredentials } from "../lib/credentials.ts";
import { getMe } from "../lib/client.ts";
import { commonArgs } from "../lib/args.ts";
import { printOutput, getOutputFormat } from "../lib/output.ts";
import { handleError } from "../lib/errors.ts";

export const meCommand = defineCommand({
  meta: {
    name: "me",
    description: "Show current user info",
  },
  args: {
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const data = await getMe(creds);

      const format = getOutputFormat(args);

      if (format === "json") {
        printOutput(data, format);
        return;
      }

      const raw = data as Record<string, unknown>;
      const currentUser = raw.currentUser as Record<string, unknown> | undefined;

      if (!currentUser) {
        printOutput(data, format);
        return;
      }

      const customer = currentUser.customer as Record<string, unknown> | undefined;
      const user = currentUser.user as Record<string, unknown> | undefined;

      const detail: Record<string, unknown> = {};

      if (user) {
        detail.name = user.name;
        const engName = user.englishName as Record<string, string> | undefined;
        if (engName) {
          detail.englishName = `${engName.firstName} ${engName.lastName}`;
        }
        detail.userIdHash = user.userIdHash;
        detail.customerIdHash = user.customerIdHash;
        detail.workspaceIdHash = user.workspaceIdHash;
      }

      if (customer) {
        detail.company = customer.name;
      }

      printOutput(detail, format);
    } catch (error) {
      handleError(error);
    }
  },
});
