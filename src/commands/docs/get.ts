import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { getDocument } from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

export const docsGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "Show approval document detail",
  },
  args: {
    documentKey: {
      type: "positional",
      description: "Document key",
      required: true,
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
      };

      // Show input fields
      const inputs = doc.inputs as Array<{
        inputField: { name: string };
        value: string;
      }> | undefined;
      if (inputs && Array.isArray(inputs)) {
        for (const input of inputs) {
          const name = input.inputField?.name ?? "unknown";
          detail[name] = input.value ?? "";
        }
      }

      // Show approval lines
      const approvalProcess = resp.approvalProcess as Record<string, unknown> | undefined;
      if (approvalProcess) {
        detail.approvalStatus = approvalProcess.status ?? "-";
        const lines = approvalProcess.lines as Array<{
          step: number;
          status?: string;
          actors?: Array<{ name?: string; status?: string }>;
          actor?: Array<{ type: string; value: string }>;
        }> | undefined;
        if (lines && Array.isArray(lines)) {
          for (const line of lines) {
            const actorInfo = line.actors
              ?.map((a) => `${a.name ?? "?"}(${a.status ?? "?"})`)
              .join(", ") ?? line.status ?? "-";
            detail[`approval_step_${line.step}`] = actorInfo;
          }
        }
      }

      printOutput(detail, format);
    } catch (error) {
      handleError(error);
    }
  },
});
