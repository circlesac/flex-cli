import { defineCommand } from "citty";
import { requireCredentials } from "../lib/credentials.ts";
import { searchUsers } from "../lib/client.ts";
import { commonArgs } from "../lib/args.ts";
import { printOutput, getOutputFormat } from "../lib/output.ts";
import { handleError } from "../lib/errors.ts";
import type { FlexUser } from "../types/index.ts";

function findUser(users: FlexUser[], query: string): FlexUser | undefined {
  const q = query.toLowerCase();

  // Exact email match
  const byEmail = users.find((u) => u.basicInfo.email.toLowerCase() === q);
  if (byEmail) return byEmail;

  // Exact name match
  const byName = users.find(
    (u) =>
      u.basicInfo.name.toLowerCase() === q ||
      u.basicInfo.displayName?.toLowerCase() === q,
  );
  if (byName) return byName;

  // Partial match (email prefix)
  const byPrefix = users.find(
    (u) => u.basicInfo.email.toLowerCase().startsWith(q + "@"),
  );
  if (byPrefix) return byPrefix;

  // Partial name match
  return users.find(
    (u) =>
      u.basicInfo.name.toLowerCase().includes(q) ||
      (u.basicInfo.displayName?.toLowerCase().includes(q) ?? false),
  );
}

function formatUserDetail(u: FlexUser) {
  const detail: Record<string, string> = {
    name: u.basicInfo.name,
    displayName: u.basicInfo.displayName || "-",
    email: u.basicInfo.email,
    phone: (u as any).basicInfo?.phoneNumber || (u as any).privateInfo?.phoneNumber || "-",
    personalEmail: (u as any).privateInfo?.personalEmail || "-",
    userIdHash: u.userIdHash,
    departments: u.employeeInfo.departments.map((d) => `${d.name} (${d.code})`).join(", ") || "-",
    jobTitles: u.employeeInfo.jobTitles.map((j) => j.name).join(", ") || "-",
    jobRanks: u.employeeInfo.jobRanks.map((j) => j.name).join(", ") || "-",
    jobRoles: u.employeeInfo.jobRoles.map((j) => j.name).join(", ") || "-",
    jobGroups: u.employeeInfo.jobGroups.map((j) => j.name).join(", ") || "-",
    isHead: (u as any).employeeInfo?.positions?.[0]?.isHeadUser ? "Yes" : "No",
    status: u.tagInfo.userStatuses.join(", "),
  };
  return detail;
}

export const userCommand = defineCommand({
  meta: {
    name: "user",
    description: "Show details for a single user",
  },
  args: {
    query: {
      type: "positional",
      description: "Email address or name to look up",
      required: true,
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const resp = await searchUsers(creds);

      const user = findUser(resp.list, args.query);
      if (!user) {
        console.error(`\x1b[31m✗\x1b[0m No user found matching "${args.query}"`);
        process.exit(1);
      }

      const format = getOutputFormat(args);
      printOutput(formatUserDetail(user), format);
    } catch (error) {
      handleError(error);
    }
  },
});
