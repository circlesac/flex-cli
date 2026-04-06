import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { searchUsers } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";
import type { FlexUser } from "../../types/index.ts";

function matchesQuery(user: FlexUser, query: string): boolean {
  const q = query.toLowerCase();
  const { name, email, displayName } = user.basicInfo;
  const deptNames = user.employeeInfo.departments
    .map((d) => d.name.toLowerCase());

  return (
    name.toLowerCase().includes(q) ||
    (displayName?.toLowerCase().includes(q) ?? false) ||
    email.toLowerCase().includes(q) ||
    deptNames.some((d) => d.includes(q))
  );
}

function matchesDepartment(user: FlexUser, dept: string): boolean {
  const d = dept.toLowerCase();
  return user.employeeInfo.departments.some((dep) =>
    dep.name.toLowerCase().includes(d),
  );
}

export const searchCommand = defineCommand({
  meta: {
    name: "search",
    description: "Search users by name, email, or department",
  },
  args: {
    query: {
      type: "positional",
      description: "Search query (name, email, or department)",
      required: true,
    },
    department: {
      type: "string",
      description: "Filter by department name",
      alias: "d",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const resp = await searchUsers(creds);

      let filtered = resp.list.filter((u) => matchesQuery(u, args.query));
      if (args.department) {
        filtered = filtered.filter((u) => matchesDepartment(u, args.department!));
      }

      const format = getOutputFormat(args);
      const rows = filtered.map((u) => ({
        name: u.basicInfo.displayName || u.basicInfo.name,
        korName: u.basicInfo.name,
        email: u.basicInfo.email,
        phone: (u as any).basicInfo?.phoneNumber || (u as any).privateInfo?.phoneNumber || "-",
        department: u.employeeInfo.departments.map((d) => d.name).join(", ") || "-",
        role: u.employeeInfo.jobRoles.map((r) => r.name).join(", ") || "-",
        title: u.employeeInfo.jobTitles.map((t) => t.name).join(", ") || "-",
        isHead: (u as any).employeeInfo?.positions?.[0]?.isHeadUser ? "Yes" : "",
        status: u.tagInfo.userStatuses.join(", "),
      }));

      console.error(`\x1b[2m${filtered.length} results\x1b[0m`);
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
