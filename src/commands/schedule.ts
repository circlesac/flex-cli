import { defineCommand } from "citty";
import { requireCredentials } from "../lib/credentials.ts";
import {
  getCoworkerCalendars,
  getPrimaryCalendar,
  getUserCalendar,
  getCalendarEvents,
  searchUsers,
} from "../lib/client.ts";
import { commonArgs } from "../lib/args.ts";
import { printOutput, getOutputFormat } from "../lib/output.ts";
import { handleError } from "../lib/errors.ts";
import type {
  FlexCalendar,
  FlexCalendarEvent,
  FlexEventType,
  FlexUser,
} from "../types/index.ts";

const TZ_OFFSET = "+09:00";
const ALL_TYPES: FlexEventType[] = [
  "TIME_OFF",
  "WORK_RECORD",
  "ONE_ON_ONE",
  "INTERVIEW",
  "BIRTHDAY",
  "COMPANY_JOIN_DAY",
];

const TYPE_ICONS: Record<FlexEventType, string> = {
  TIME_OFF: "🌴",
  WORK_RECORD: "💼",
  ONE_ON_ONE: "🗣️",
  INTERVIEW: "🎤",
  BIRTHDAY: "🎂",
  COMPANY_JOIN_DAY: "🎉",
};

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string): Date {
  // Accept YYYY-MM-DD, treat as local date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date "${s}", expected YYYY-MM-DD`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfWeekMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

function resolveRange(args: {
  from?: string;
  to?: string;
  days?: string;
  range?: string;
}): { from: Date; to: Date } {
  if (args.from || args.to) {
    const from = args.from ? parseDate(args.from) : new Date();
    const to = args.to
      ? (() => {
          const d = parseDate(args.to);
          d.setDate(d.getDate() + 1);
          return d;
        })()
      : new Date(from.getTime() + 24 * 3600 * 1000);
    if (to.getTime() <= from.getTime()) {
      throw new Error(
        `--to (${args.to}) must be on or after --from (${args.from ?? fmtDate(new Date())})`,
      );
    }
    return { from, to };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch ((args.range ?? "today").toLowerCase()) {
    case "today": {
      const to = new Date(today);
      to.setDate(to.getDate() + 1);
      return { from: today, to };
    }
    case "tomorrow": {
      const from = new Date(today);
      from.setDate(from.getDate() + 1);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { from, to };
    }
    case "week": {
      const from = startOfWeekMonday(today);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      return { from, to };
    }
    case "next-week": {
      const from = startOfWeekMonday(today);
      from.setDate(from.getDate() + 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      return { from, to };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { from, to };
    }
    case "days": {
      const raw = args.days ?? "7";
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--days must be a positive integer, got "${raw}"`);
      }
      const to = new Date(today);
      to.setDate(to.getDate() + Math.floor(n));
      return { from: today, to };
    }
    default:
      throw new Error(
        `Unknown --range "${args.range}". Use today|tomorrow|week|next-week|month|days`,
      );
  }
}

function findUser(users: FlexUser[], query: string): FlexUser | undefined {
  const q = query.toLowerCase();
  const byEmail = users.find((u) => u.basicInfo.email.toLowerCase() === q);
  if (byEmail) return byEmail;
  const byName = users.find(
    (u) =>
      u.basicInfo.name.toLowerCase() === q ||
      u.basicInfo.displayName?.toLowerCase() === q,
  );
  if (byName) return byName;
  const byPrefix = users.find((u) =>
    u.basicInfo.email.toLowerCase().startsWith(q + "@"),
  );
  if (byPrefix) return byPrefix;
  return users.find(
    (u) =>
      u.basicInfo.name.toLowerCase().includes(q) ||
      (u.basicInfo.displayName?.toLowerCase().includes(q) ?? false),
  );
}

function fmtPeriod(start: string, endExclusive: string): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(start);
  if (isDateOnly) {
    const endInclusive = new Date(parseDate(endExclusive));
    endInclusive.setDate(endInclusive.getDate() - 1);
    const endStr = fmtDate(endInclusive);
    return start === endStr ? start : `${start} ~ ${endStr}`;
  }
  return `${start.slice(0, 16).replace("T", " ")} ~ ${endExclusive.slice(0, 16).replace("T", " ")}`;
}

interface MergedEvent {
  type: FlexEventType;
  calendarId: string;
  summary: string;
  status: string;
  start: string;
  endExclusive: string;
  count: number;
  ids: string[];
}

function mergeEvents(events: FlexCalendarEvent[]): MergedEvent[] {
  // Multi-day vacations come back as one event per day. Group by
  // (calendar, type, summary) so we can merge contiguous spans regardless
  // of taskKey (which is null for some event variants).
  const groups = new Map<string, FlexCalendarEvent[]>();
  for (const e of events) {
    const key = `${e.calendarId}::${e.flexEventType}::${e.summary}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const merged: MergedEvent[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const sa = a.startAt.date ?? a.startAt.dateTime ?? "";
      const sb = b.startAt.date ?? b.startAt.dateTime ?? "";
      return sa.localeCompare(sb);
    });

    // Walk through and merge contiguous date-only events
    let cur: MergedEvent | null = null;
    for (const e of list) {
      const start = e.startAt.date ?? e.startAt.dateTime ?? "";
      const endExclusive =
        e.endAtExclusive.date ?? e.endAtExclusive.dateTime ?? start;

      if (
        cur &&
        cur.type === e.flexEventType &&
        cur.endExclusive === start
      ) {
        cur.endExclusive = endExclusive;
        cur.count += 1;
        cur.ids.push(e.id);
      } else {
        if (cur) merged.push(cur);
        cur = {
          type: e.flexEventType,
          calendarId: e.calendarId,
          summary: e.summary,
          status: e.status,
          start,
          endExclusive,
          count: 1,
          ids: [e.id],
        };
      }
    }
    if (cur) merged.push(cur);
  }

  merged.sort((a, b) => a.start.localeCompare(b.start));
  return merged;
}


export const scheduleCommand = defineCommand({
  meta: {
    name: "schedule",
    description:
      "Show team schedule (vacations, work records, birthdays, etc.) from Flex calendars",
  },
  args: {
    range: {
      type: "string",
      description:
        "Preset range: today|tomorrow|week|next-week|month|days (default: today)",
      alias: "r",
    },
    days: {
      type: "string",
      description: "Number of days when --range=days (default: 7)",
      alias: "d",
    },
    from: {
      type: "string",
      description: "Start date YYYY-MM-DD (overrides --range)",
    },
    to: {
      type: "string",
      description: "End date YYYY-MM-DD inclusive (overrides --range)",
    },
    user: {
      type: "string",
      description: "Limit to a specific user (name/email match)",
      alias: "u",
    },
    types: {
      type: "string",
      description: `Comma-separated event types: ${ALL_TYPES.join(",")} (default: all)`,
      alias: "t",
    },
    me: {
      type: "boolean",
      description: "Include only my own events",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();

      const { from, to } = resolveRange(args);
      const dateTimeMin = `${fmtDate(from)}T00:00:00${TZ_OFFSET}`;
      const dateTimeMaxExclusive = `${fmtDate(to)}T00:00:00${TZ_OFFSET}`;

      const types = args.types
        ? (args.types.split(",").map((t) => t.trim().toUpperCase()) as FlexEventType[])
        : ALL_TYPES;
      const unknown = types.filter((t) => !ALL_TYPES.includes(t));
      if (unknown.length) {
        console.error(
          `\x1b[31m✗\x1b[0m Unknown event types: ${unknown.join(", ")}`,
        );
        process.exit(1);
      }

      // Build calendar id -> user info map
      const calendars: FlexCalendar[] = [];

      if (args.user) {
        const usersResp = await searchUsers(creds);
        const user = findUser(usersResp.list, args.user);
        if (!user) {
          console.error(
            `\x1b[31m✗\x1b[0m No user found matching "${args.user}"`,
          );
          process.exit(1);
        }
        const cal = await getUserCalendar(creds, user.userIdHash);
        calendars.push({
          ...cal,
          userDisplayName:
            user.basicInfo.displayName || user.basicInfo.name,
          departmentName:
            user.employeeInfo.departments.map((d) => d.name).join(", ") || "",
        });
      } else {
        const primary = await getPrimaryCalendar(creds);
        calendars.push({ ...primary, userDisplayName: "Me" });
        if (!args.me) {
          const co = await getCoworkerCalendars(creds);
          calendars.push(...co.calendars);
        }
      }

      const calendarById = new Map(calendars.map((c) => [c.id, c]));
      const events = await getCalendarEvents(creds, {
        calendarIds: calendars.map((c) => c.id),
        dateTimeMin,
        dateTimeMaxExclusive,
        flexEventTypes: types,
      });

      const merged = mergeEvents(events.list);

      const rows = merged.map((e) => {
        const cal = calendarById.get(e.calendarId);
        return {
          when: fmtPeriod(e.start, e.endExclusive),
          type: `${TYPE_ICONS[e.type] ?? ""} ${e.type}`.trim(),
          name: cal?.userDisplayName || "-",
          department: cal?.departmentName || "-",
          summary: e.summary,
          status: e.status,
        };
      });

      const format = getOutputFormat(args);
      const rawN = events.list.length;
      console.error(
        `\x1b[2m${rows.length} item${rows.length === 1 ? "" : "s"} (${rawN} raw event${rawN === 1 ? "" : "s"})  ${fmtDate(from)} → ${fmtDate(new Date(to.getTime() - 86400000))}  (${calendars.length} calendar${calendars.length === 1 ? "" : "s"})\x1b[0m`,
      );

      if (format === "json") {
        printOutput(
          {
            range: { from: fmtDate(from), to: fmtDate(to) },
            calendars: calendars.map((c) => ({
              id: c.id,
              userIdHash: c.userIdHash,
              userDisplayName: c.userDisplayName ?? null,
              departmentName: c.departmentName ?? null,
            })),
            merged,
            events: events.list,
          },
          format,
        );
        return;
      }

      printOutput(rows, format, [
        { key: "when", label: "When" },
        { key: "type", label: "Type" },
        { key: "name", label: "Who" },
        { key: "department", label: "Department" },
        { key: "summary", label: "Summary" },
        { key: "status", label: "Status" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
