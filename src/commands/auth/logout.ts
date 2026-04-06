import { defineCommand } from "citty";
import { removeCredentials } from "../../lib/credentials.ts";
import { handleError } from "../../lib/errors.ts";

export const logoutCommand = defineCommand({
  meta: {
    name: "logout",
    description: "Clear stored credentials",
  },
  run: async () => {
    try {
      const removed = await removeCredentials();
      if (removed) {
        console.log(`\x1b[32m✓\x1b[0m Credentials removed`);
      } else {
        console.log(`\x1b[33m⚠\x1b[0m No credentials found`);
      }
    } catch (error) {
      handleError(error);
    }
  },
});
