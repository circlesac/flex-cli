import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { commonArgs } from "../../lib/args.ts";
import { printOutput, getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";
import { resolveContext, checkinContextArgs } from "./common.ts";

export const checkinListCommand = defineCommand({
  meta: { name: "list", description: "작성 대기 평가의 피평가자 목록 + 진행상태" },
  args: { ...checkinContextArgs, ...commonArgs },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const ctx = await resolveContext(creds, args);
      const format = getOutputFormat(args);
      console.error(
        `\x1b[2m${ctx.title || ctx.evalId} · ${ctx.step}/${ctx.depth}${ctx.due ? ` · 마감 ${ctx.due}` : ""}\x1b[0m`,
      );
      printOutput(
        ctx.reviewees.map((r) => ({
          name: r.name,
          revieweeId: r.revieweeIdHash,
          status: r.writingStatus,
        })),
        format,
        [
          { key: "name", label: "Reviewee" },
          { key: "revieweeId", label: "RevieweeId" },
          { key: "status", label: "Status" },
        ],
      );
    } catch (error) {
      handleError(error);
    }
  },
});
