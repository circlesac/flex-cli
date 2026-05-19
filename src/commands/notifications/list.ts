import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { listNotificationTopics } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";
import type { NotificationTopic } from "../../types/index.ts";

function formatRelativeTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function flattenTopic(t: NotificationTopic) {
  return {
    id: t.id,
    read: t.topicRead ? "✓" : "·",
    title: t.topicTitle,
    text: t.notification.text,
    createdAt: formatRelativeTime(t.notification.createdAt),
    ctaWebLink: t.notification.ctaWebLink ?? "",
  };
}

export const notificationsListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List notification topics",
  },
  args: {
    size: {
      type: "string",
      description: "Number of topics to fetch (default: 20)",
    },
    unread: {
      type: "boolean",
      description: "Show only unread topics (client-side filter on topicRead)",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const size = args.size ? Number.parseInt(args.size, 10) : 20;
      if (!Number.isFinite(size) || size <= 0) {
        throw new Error("--size must be a positive integer");
      }
      const resp = await listNotificationTopics(creds, size);

      let topics = resp.topics;
      if (args.unread) topics = topics.filter((t) => !t.topicRead);

      const format = getOutputFormat(args);
      const rows = topics.map(flattenTopic);

      const unreadCount = resp.topics.filter((t) => !t.topicRead).length;
      console.error(
        `\x1b[2m${rows.length} topics (${unreadCount} unread in this page, hasNext=${resp.hasNext})\x1b[0m`,
      );

      printOutput(rows, format, [
        { key: "id", label: "ID" },
        { key: "read", label: "R" },
        { key: "title", label: "Title" },
        { key: "text", label: "Text" },
        { key: "createdAt", label: "CreatedAt" },
      ]);
    } catch (error) {
      handleError(error);
    }
  },
});
