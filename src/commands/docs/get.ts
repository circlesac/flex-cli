import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { getDocument } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

/** Strip HTML tags + decode common entities. Renders the rich-text body
 *  into plaintext for the table view. */
function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Web UI URL for an approval document. The `archive/my` path looks
 *  user-scoped but the `workflow-task-key` query param drives the view,
 *  so this link opens the doc for any account (writer, approver,
 *  referrer). The bare `/workflow/document/<key>` path does NOT open
 *  the doc for non-writer accounts. See circlesac/flex-cli#1. */
function flexWebUrl(documentKey: string): string {
  return `https://flex.team/workflow/archive/my?workflow-action=view&workflow-task-key=${documentKey}`;
}

export const docsGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "Show approval document detail (inputs, body, attachments, approval line)",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Document key",
      required: true,
    },
    body: {
      type: "boolean",
      description: "Include the rich-text body (HTML stripped to plaintext)",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const resp = (await getDocument(creds, args.documentKey)) as Record<string, unknown>;

      const format = getOutputFormat(args);

      if (format === "json") {
        printOutput(resp, format);
        return;
      }

      const doc = resp.document as Record<string, unknown> | undefined;
      if (!doc) {
        printOutput(resp, format);
        return;
      }

      const detail: Record<string, unknown> = {
        documentKey: doc.documentKey,
        code: doc.code,
        title: doc.title,
        status: doc.status,
        writer: (doc.writer as Record<string, unknown>)?.name ?? "-",
        writtenAt: (doc.writtenAt as string)?.slice(0, 10) ?? "-",
        url: flexWebUrl(String(doc.documentKey ?? "")),
      };

      // Input fields. Multi-select inputs are stored as JSON-stringified
      // arrays (e.g. '["해외출장"]') — unwrap to a comma-joined string.
      const inputs = doc.inputs as Array<{
        inputField: { name: string };
        value: string;
      }> | undefined;
      if (inputs && Array.isArray(inputs)) {
        for (const input of inputs) {
          const name = input.inputField?.name ?? "unknown";
          const v = input.value ?? "";
          let pretty: string = v;
          if (typeof v === "string" && v.startsWith("[") && v.endsWith("]")) {
            try {
              const parsed = JSON.parse(v);
              if (Array.isArray(parsed)) pretty = parsed.join(", ");
            } catch { /* leave as-is */ }
          }
          detail[name] = pretty;
        }
      }

      // Approval lines + referrers
      const approvalProcess = resp.approvalProcess as Record<string, unknown> | undefined;
      if (approvalProcess) {
        detail.approvalStatus = approvalProcess.status ?? "-";
        const lines = approvalProcess.lines as Array<{
          step: number;
          status?: string;
          actors?: Array<{ name?: string; status?: string }>;
        }> | undefined;
        if (lines && Array.isArray(lines)) {
          for (const line of lines) {
            const actorInfo = line.actors
              ?.map((a) => `${a.name ?? "?"}(${a.status ?? "?"})`)
              .join(", ") ?? line.status ?? "-";
            detail[`approval_step_${line.step}`] = actorInfo;
          }
        }
        const referrers = approvalProcess.referrers as Array<{
          resolvedTarget?: { displayName?: string };
        }> | undefined;
        if (referrers && Array.isArray(referrers) && referrers.length > 0) {
          detail.referrers = referrers
            .map((r) => r.resolvedTarget?.displayName ?? "?")
            .join(", ");
        }
      }

      // Attachments
      const attachments = doc.attachments as Array<{
        file?: { fileName?: string; size?: number };
      }> | undefined;
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        detail.attachments = attachments
          .map((a) => `${a.file?.fileName ?? "?"} (${a.file?.size ?? 0}B)`)
          .join("; ");
      }

      // Body (opt-in via --body flag — full HTML is always in --json)
      if (args.body) {
        const content = (doc.content as string) ?? (doc.simpleContent as string) ?? "";
        if (content) detail.body = htmlToText(content);
      }

      printOutput(detail, format);
    } catch (error) {
      handleError(error);
    }
  },
});
