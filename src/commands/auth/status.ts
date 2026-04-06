import { defineCommand } from "citty";
import { loadCredentials } from "../../lib/credentials.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show authentication state and AID JWT expiry",
  },
  args: {
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await loadCredentials();
      if (!creds) {
        console.log(
          `\x1b[33m⚠\x1b[0m Not authenticated. Run "flex auth login" first.`,
        );
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const expired = creds.exp <= now;
      const daysRemaining = expired
        ? 0
        : Math.floor((creds.exp - now) / 86400);

      const info = {
        customerUuid: creds.customerUuid,
        expires: new Date(creds.exp * 1000).toISOString(),
        daysRemaining,
        status: expired ? "EXPIRED" : "ACTIVE",
      };

      const format = getOutputFormat(args);
      printOutput(info, format);
    } catch (error) {
      handleError(error);
    }
  },
});
