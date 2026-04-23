import { defineCommand } from "citty";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { requireCredentials } from "../../lib/credentials.ts";
import {
  resolvePolicy,
  draftDocument,
  submitDocument,
} from "../../lib/client.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";

interface SubmitPayload {
  document: {
    templateKey: string;
    title: string;
    content?: string;
    inputs?: Array<{ inputFieldIdHash: string; value: string }>;
    attachments?: unknown[];
  };
  approvalProcess: {
    lines: Array<{
      step: number;
      actors: Array<{ resolveTarget: { type: string; value: string } }>;
    }>;
    referrers?: unknown[];
    option?: { approvalStepEditEnabled: boolean };
    matchingData?: { matchedAt: string; matchHistoryId: string };
  };
}

export const docsSubmitCommand = defineCommand({
  meta: {
    name: "submit",
    description: "Submit an approval document from a payload JSON file",
  },
  args: {
    payload: {
      type: "string",
      description: "Path to payload JSON",
      required: true,
    },
    "dry-run": {
      type: "boolean",
      description: "Create draft only, don't submit",
    },
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();

      const payloadPath = resolve(args.payload);
      if (!existsSync(payloadPath)) {
        throw new Error(`Payload file not found: ${payloadPath}`);
      }

      const payload = JSON.parse(
        readFileSync(payloadPath, "utf-8"),
      ) as SubmitPayload;

      const templateKey = payload.document?.templateKey;
      if (!templateKey) {
        throw new Error("payload.document.templateKey is required");
      }
      if (!payload.document?.title) {
        throw new Error("payload.document.title is required");
      }
      if (!payload.approvalProcess?.lines?.length) {
        throw new Error("payload.approvalProcess.lines is required");
      }

      // 1. resolve-policy to get fresh matchingData
      const policy = (await resolvePolicy(creds, templateKey)) as {
        approvalPolicyMatched?: {
          matchMetadata?: { matchedAt: string; matchHistoryId: string };
        };
      };
      const meta = policy.approvalPolicyMatched?.matchMetadata;
      if (!meta?.matchedAt || !meta?.matchHistoryId) {
        throw new Error(
          "resolve-policy did not return matchMetadata (approval policy may not match this template)",
        );
      }

      payload.approvalProcess.referrers ??= [];
      payload.approvalProcess.option ??= { approvalStepEditEnabled: false };
      payload.approvalProcess.matchingData = {
        matchedAt: meta.matchedAt,
        matchHistoryId: meta.matchHistoryId,
      };
      payload.document.attachments ??= [];
      payload.document.inputs ??= [];

      // 2. Create draft with client-generated documentKey
      const documentKey = crypto.randomUUID().replace(/-/g, "");
      await draftDocument(creds, documentKey, payload);
      console.error(
        `\x1b[2mdraft created: documentKey=${documentKey}\x1b[0m`,
      );

      const format = getOutputFormat(args);

      if (args["dry-run"]) {
        console.error("\x1b[33mdry-run: submission skipped\x1b[0m");
        printOutput(
          {
            documentKey,
            status: "DRAFT",
            title: payload.document.title,
          },
          format,
        );
        return;
      }

      // 3. Submit
      const submitBody = { ...payload, draftDocumentKey: documentKey };
      const resp = (await submitDocument(creds, submitBody)) as {
        document?: { documentKey?: string; code?: string; status?: string; title?: string };
      };
      const doc = resp.document ?? {};

      printOutput(
        {
          documentKey: doc.documentKey ?? documentKey,
          code: doc.code ?? "-",
          status: doc.status ?? "SUBMITTED",
          title: doc.title ?? payload.document.title,
        },
        format,
      );
    } catch (error) {
      handleError(error);
    }
  },
});
