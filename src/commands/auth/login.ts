import { defineCommand } from "citty";
import { extractBrowserCookies } from "../../lib/auth.ts";
import { storeCredentials } from "../../lib/credentials.ts";
import { handleError } from "../../lib/errors.ts";

export const loginCommand = defineCommand({
  meta: {
    name: "login",
    description: "Extract browser cookies and store credentials",
  },
  run: async () => {
    try {
      const creds = await extractBrowserCookies();
      await storeCredentials(creds);

      const expDate = new Date(creds.exp * 1000);
      const daysRemaining = Math.floor(
        (creds.exp - Date.now() / 1000) / 86400,
      );

      console.log(`\x1b[32m✓\x1b[0m Authenticated via ${creds.browser}`);
      console.log(`  Customer UUID: ${creds.customerUuid}`);
      console.log(`  AID expires:   ${expDate.toISOString()} (${daysRemaining} days)`);
    } catch (error) {
      handleError(error);
    }
  },
});
