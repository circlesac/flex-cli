import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { searchUsers } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";
import type { FlexUser } from "../../types/index.ts";

function flattenUser(u: FlexUser) {
  return {
    name: u.basicInfo.displayName || u.basicInfo.name,
    korName: u.basicInfo.name,
    email: u.basicInfo.email,
    phone: (u as any).basicInfo?.phoneNumber || (u as any).privateInfo?.phoneNumber || "-",
    department: u.employeeInfo.departments.map((d) => d.name).join(", ") || "-",
    role: u.employeeInfo.jobRoles.map((r) => r.name).join(", ") || "-",
    title: u.employeeInfo.jobTitles.map((t) => t.name).join(", ") || "-",
    isHead: (u as any).employeeInfo?.positions?.[0]?.isHeadUser ? "Yes" : "",
    status: u.tagInfo.userStatuses.join(", "),
  };
}

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all users with department info",
  },
  args: {
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const resp = await searchUsers(creds);

      const format = getOutputFormat(args);
      const rows = resp.list.map(flattenUser);

      console.error(`\x1b[2m${resp.total.value} users\x1b[0m`);
      printOutput(rows, format, [
        { key: "name", label: "Name" },
        { key: "korName", label: "Korean" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "department", label: "Department" },
        { key: "role", label: "Role" },
        { key: "title", label: "Title" },
        { key: "isHead", label: "Head" },
        { key: "status", label: "Status" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
