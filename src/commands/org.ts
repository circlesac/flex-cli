import { defineCommand } from "citty";
import { requireCredentials } from "../lib/credentials.ts";
import {
  searchUsers,
  getDepartments,
  getDepartmentUserCounts,
} from "../lib/client.ts";
import { commonArgs } from "../lib/args.ts";
import { getOutputFormat, printOutput } from "../lib/output.ts";
import { handleError } from "../lib/errors.ts";
import type { FlexDepartment, FlexUser } from "../types/index.ts";

interface DeptNode {
  dept: FlexDepartment;
  children: DeptNode[];
  headUser: string | null;
  members: string[];
  directCount: number;
  totalCount: number;
}

function buildTree(
  departments: FlexDepartment[],
  countMap: Map<string, { count: number; totalCount: number }>,
  usersByDept: Map<string, { heads: string[]; members: string[] }>,
): DeptNode[] {
  const nodeMap = new Map<string, DeptNode>();

  // Create nodes
  for (const dept of departments) {
    const counts = countMap.get(dept.idHash);
    const users = usersByDept.get(dept.idHash);
    nodeMap.set(dept.idHash, {
      dept,
      children: [],
      headUser: users?.heads[0] ?? null,
      members: users?.members ?? [],
      directCount: counts?.count ?? 0,
      totalCount: counts?.totalCount ?? 0,
    });
  }

  // Build parent-child relationships
  const roots: DeptNode[] = [];
  for (const node of nodeMap.values()) {
    const parentId = node.dept.parentDepartmentIdHash;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by displayOrder
  const sortChildren = (nodes: DeptNode[]) => {
    nodes.sort((a, b) => a.dept.displayOrder - b.dept.displayOrder);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

function renderTree(
  nodes: DeptNode[],
  prefix: string,
  showMembers: boolean,
): string[] {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    const childPrefix = prefix + (isLast ? "   " : "│  ");

    // Department line with total count
    const countStr =
      node.totalCount > 0 ? ` \x1b[2m(${node.totalCount})\x1b[0m` : "";
    lines.push(`${prefix}${connector}\x1b[1m${node.dept.name}\x1b[0m${countStr}`);

    // Determine sub-items: head user, members, children
    const subItems: { type: "head" | "member" | "count"; text: string }[] = [];

    if (showMembers) {
      if (node.headUser) {
        subItems.push({ type: "head", text: node.headUser });
      }
      for (const m of node.members) {
        if (m !== node.headUser) {
          subItems.push({ type: "member", text: m });
        }
      }
    } else {
      if (node.headUser) {
        subItems.push({ type: "head", text: node.headUser });
      }
      const memberCount = node.members.filter(
        (m) => m !== node.headUser,
      ).length;
      if (memberCount > 0) {
        subItems.push({
          type: "count",
          text: `${memberCount} member${memberCount > 1 ? "s" : ""}`,
        });
      }
    }

    const totalSub = subItems.length + node.children.length;
    let subIdx = 0;

    for (const item of subItems) {
      subIdx++;
      const subIsLast = subIdx === totalSub;
      const subConnector = subIsLast ? "└─ " : "├─ ";
      if (item.type === "head") {
        lines.push(
          `${childPrefix}${subConnector}\x1b[33m${item.text}\x1b[0m \x1b[2m(Head)\x1b[0m`,
        );
      } else if (item.type === "member") {
        lines.push(`${childPrefix}${subConnector}${item.text}`);
      } else {
        lines.push(
          `${childPrefix}${subConnector}\x1b[2m${item.text}\x1b[0m`,
        );
      }
    }

    // Render children (they account for the remaining totalSub items)
    if (node.children.length > 0) {
      const childLines = renderTree(node.children, childPrefix, showMembers);
      lines.push(...childLines);
    }
  }

  return lines;
}

function flatView(
  usersByDept: Map<string, { heads: string[]; members: string[] }>,
  deptNames: Map<string, string>,
): { department: string; count: number; members: string[] }[] {
  const groups: { department: string; count: number; members: string[] }[] = [];
  for (const [deptId, users] of usersByDept) {
    const name = deptNames.get(deptId) ?? deptId;
    const all = [...users.heads, ...users.members.filter((m) => !users.heads.includes(m))];
    groups.push({ department: name, count: all.length, members: all.sort() });
  }
  return groups.sort((a, b) => a.department.localeCompare(b.department));
}

function treeToJson(nodes: DeptNode[]): unknown[] {
  return nodes.map((n) => ({
    id: n.dept.idHash,
    name: n.dept.name,
    code: n.dept.code,
    headUser: n.headUser,
    directCount: n.directCount,
    totalCount: n.totalCount,
    memberCount: n.members.length,
    members: n.members,
    children: treeToJson(n.children),
  }));
}

export const orgCommand = defineCommand({
  meta: {
    name: "org",
    description: "Show organization tree grouped by department",
  },
  args: {
    ...commonArgs,
    flat: {
      type: "boolean" as const,
      description: "Show flat department list instead of tree",
    },
    members: {
      type: "boolean" as const,
      description: "Show individual member names under each department",
    },
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();

      // Fetch all data in parallel
      const [departments, counts, usersResp] = await Promise.all([
        getDepartments(creds),
        getDepartmentUserCounts(creds),
        searchUsers(creds),
      ]);

      // Build count map
      const countMap = new Map<string, { count: number; totalCount: number }>();
      for (const c of counts) {
        countMap.set(c.departmentIdHash, {
          count: c.count,
          totalCount: c.totalCount,
        });
      }

      // Build users-by-department map
      const usersByDept = new Map<
        string,
        { heads: string[]; members: string[] }
      >();
      const deptNames = new Map<string, string>();
      for (const dept of departments) {
        deptNames.set(dept.idHash, dept.name);
      }

      for (const u of usersResp.list) {
        const name = u.basicInfo.displayName || u.basicInfo.name;
        const positions = (u as any).employeeInfo?.positions ?? [];
        const isHead = positions[0]?.isHeadUser === true;

        for (const d of u.employeeInfo.departments) {
          if (!usersByDept.has(d.idHash)) {
            usersByDept.set(d.idHash, { heads: [], members: [] });
          }
          const entry = usersByDept.get(d.idHash)!;
          if (isHead) {
            entry.heads.push(name);
          }
          entry.members.push(name);
        }
      }

      const format = getOutputFormat(args);

      // --flat mode
      if (args.flat) {
        const groups = flatView(usersByDept, deptNames);

        if (format === "json") {
          printOutput(groups, format);
          return;
        }

        if (format === "plain") {
          for (const g of groups) {
            for (const m of g.members) {
              console.log(`${g.department}\t${m}`);
            }
          }
          return;
        }

        for (const g of groups) {
          console.log(
            `\x1b[1m${g.department}\x1b[0m \x1b[2m(${g.count})\x1b[0m`,
          );
          for (let i = 0; i < g.members.length; i++) {
            const pfx =
              i === g.members.length - 1 ? "  └─ " : "  ├─ ";
            console.log(`${pfx}${g.members[i]}`);
          }
        }
        console.error(
          `\n\x1b[2m${groups.length} departments, ${usersResp.total.value} users\x1b[0m`,
        );
        return;
      }

      // Tree mode (default)
      const tree = buildTree(departments, countMap, usersByDept);

      if (format === "json") {
        printOutput(treeToJson(tree), format);
        return;
      }

      if (format === "plain") {
        const printFlat = (nodes: DeptNode[], depth: number) => {
          for (const n of nodes) {
            const indent = "  ".repeat(depth);
            console.log(`${indent}${n.dept.name}\t${n.totalCount}`);
            printFlat(n.children, depth + 1);
          }
        };
        printFlat(tree, 0);
        return;
      }

      // Table format: tree rendering
      for (const root of tree) {
        const countStr =
          root.totalCount > 0
            ? ` \x1b[2m(${root.totalCount})\x1b[0m`
            : "";
        console.log(`\x1b[1m${root.dept.name}\x1b[0m${countStr}`);

        const showMembers = args.members === true;

        // Render head + members for root
        const subItems: { type: "head" | "member" | "count"; text: string }[] = [];
        if (showMembers) {
          const users = usersByDept.get(root.dept.idHash);
          if (users) {
            for (const h of users.heads) {
              subItems.push({ type: "head", text: h });
            }
            for (const m of users.members) {
              if (!users.heads.includes(m)) {
                subItems.push({ type: "member", text: m });
              }
            }
          }
        } else {
          if (root.headUser) {
            subItems.push({ type: "head", text: root.headUser });
          }
          const memberCount = root.members.filter(
            (m) => m !== root.headUser,
          ).length;
          if (memberCount > 0) {
            subItems.push({
              type: "count",
              text: `${memberCount} member${memberCount > 1 ? "s" : ""}`,
            });
          }
        }

        const totalSub = subItems.length + root.children.length;
        let subIdx = 0;
        for (const item of subItems) {
          subIdx++;
          const subIsLast = subIdx === totalSub;
          const connector = subIsLast ? "└─ " : "├─ ";
          if (item.type === "head") {
            console.log(
              `${connector}\x1b[33m${item.text}\x1b[0m \x1b[2m(Head)\x1b[0m`,
            );
          } else if (item.type === "member") {
            console.log(`${connector}${item.text}`);
          } else {
            console.log(`${connector}\x1b[2m${item.text}\x1b[0m`);
          }
        }

        if (root.children.length > 0) {
          const childLines = renderTree(root.children, "", showMembers);
          for (const line of childLines) {
            console.log(line);
          }
        }
        console.log();
      }

      console.error(
        `\x1b[2m${departments.length} departments, ${usersResp.total.value} users\x1b[0m`,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
