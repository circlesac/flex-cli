import { defineCommand } from "citty";
import { createInterface } from "node:readline/promises";
import { requireCredentials } from "../../lib/credentials.ts";
import { FlexError, handleError } from "../../lib/errors.ts";
import {
  getUserForm,
  getCustomGrade,
  submitReviewee,
  type RevieweeMapping,
} from "../../lib/evaluation.ts";
import { resolveContext, findReviewee, checkinContextArgs, type CheckinContext } from "./common.ts";
import type { FlexCredentials } from "../../types/index.ts";

async function preflight(
  creds: FlexCredentials,
  ctx: CheckinContext,
  rv: RevieweeMapping,
): Promise<string[]> {
  const issues: string[] = [];
  const forms = await Promise.all(
    rv.userFormIds.map((id) => getUserForm(creds, ctx.reviewer, id)),
  );
  for (const form of forms) {
    for (const q of form.questions) {
      if (!q.required) continue;
      const filled = !!(q.currentAnswer?.elementId || q.currentAnswer?.text);
      if (!filled) issues.push(`미입력(필수): ${q.title}`);
    }
  }
  const grade = await getCustomGrade(
    creds,
    ctx.evalId,
    rv.revieweeIdHash,
    ctx.reviewer,
    ctx.step,
    ctx.depth,
  );
  if (!grade) issues.push("최종등급(CUSTOM) 미선택 — 제출 게이트");
  return issues;
}

export const checkinSubmitCommand = defineCommand({
  meta: { name: "submit", description: "평가 제출 (비가역). 기본 확인 프롬프트." },
  args: {
    reviewee: { type: "positional", description: "피평가자 이름/idHash (--all 이면 생략)", required: false },
    all: { type: "boolean", description: "BEFORE_START/IN_PROGRESS 전원 제출" },
    yes: { type: "boolean", description: "확인 프롬프트 건너뛰기" },
    ...checkinContextArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const ctx = await resolveContext(creds, args);

      let targets: RevieweeMapping[];
      if (args.all) {
        targets = ctx.reviewees.filter((r) => r.writingStatus !== "SUBMITTED");
      } else {
        if (!args.reviewee) throw new FlexError("피평가자를 지정하거나 --all 을 쓰세요.", "NO_TARGET");
        targets = [findReviewee(ctx.reviewees, args.reviewee)];
      }
      if (targets.length === 0) {
        console.error("제출할 대상이 없습니다 (전원 SUBMITTED).");
        return;
      }

      // preflight 검증
      const blocked: string[] = [];
      for (const rv of targets) {
        const issues = await preflight(creds, ctx, rv);
        if (issues.length) blocked.push(`${rv.name}:\n  - ${issues.join("\n  - ")}`);
      }
      if (blocked.length) {
        throw new FlexError(`제출 불가 (필수 항목 미충족):\n${blocked.join("\n")}`, "PREFLIGHT");
      }

      console.error(`\x1b[33m제출 대상 (비가역):\x1b[0m ${targets.map((r) => r.name).join(", ")}`);
      if (!args.yes) {
        if (!process.stdin.isTTY) {
          throw new FlexError("비대화형: 제출하려면 --yes 를 붙이세요.", "NEEDS_CONFIRM");
        }
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        const ans = (await rl.question('정말 제출할까요? 평가 기간 종료 후 수정 불가. ("yes" 입력): ')).trim();
        rl.close();
        if (ans !== "yes") {
          console.error("취소됨.");
          return;
        }
      }

      for (const rv of targets) {
        await submitReviewee(creds, ctx.evalId, rv.revieweeIdHash, ctx.reviewer, ctx.step, ctx.depth);
        console.log(`\x1b[32m✓\x1b[0m ${rv.name} 제출 완료 (SUBMITTED)`);
      }
    } catch (error) {
      handleError(error);
    }
  },
});
