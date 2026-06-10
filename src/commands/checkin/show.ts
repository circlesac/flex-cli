import { defineCommand } from "citty";
import { requireCredentials } from "../../lib/credentials.ts";
import { commonArgs } from "../../lib/args.ts";
import { getOutputFormat } from "../../lib/output.ts";
import { handleError } from "../../lib/errors.ts";
import { getUserForm, getCustomGrade, getCustomGradeItems } from "../../lib/evaluation.ts";
import { resolveContext, findReviewee, checkinContextArgs } from "./common.ts";

export const checkinShowCommand = defineCommand({
  meta: { name: "show", description: "피평가자 평가지(질문 + 현재 답안) 출력" },
  args: {
    reviewee: { type: "positional", description: "피평가자 이름 또는 idHash", required: true },
    ...checkinContextArgs,
    ...commonArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const ctx = await resolveContext(creds, args);
      const rv = findReviewee(ctx.reviewees, args.reviewee);

      const forms = await Promise.all(
        rv.userFormIds.map((id) => getUserForm(creds, ctx.reviewer, id)),
      );
      const gradeItems = await getCustomGradeItems(creds, ctx.evalId, ctx.step, ctx.depth);
      const customGradeId = await getCustomGrade(
        creds,
        ctx.evalId,
        rv.revieweeIdHash,
        ctx.reviewer,
        ctx.step,
        ctx.depth,
      );

      if (args.json) {
        console.log(
          JSON.stringify(
            { reviewee: rv, forms, customGradeItemId: customGradeId, gradeItems },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`\x1b[1m${rv.name}\x1b[0m  (${rv.revieweeIdHash})  [${rv.writingStatus}]`);
      const curGrade = gradeItems.find((g) => g.gradeItemId === customGradeId);
      console.log(`\x1b[1m최종등급(CUSTOM)\x1b[0m: ${curGrade?.name ?? "(미선택)"}`);
      for (const form of forms) {
        console.log(`\n\x1b[1m── ${form.title} (${form.factor}) ──\x1b[0m`);
        for (const q of form.questions) {
          let cur = "(미입력)";
          if (q.currentAnswer?.elementId) {
            cur =
              q.elements.find((e) => e.elementId === q.currentAnswer!.elementId)?.label ??
              q.currentAnswer.elementId;
          } else if (q.currentAnswer?.text) {
            cur = q.currentAnswer.text;
          }
          const req = q.required ? "*" : " ";
          console.log(`${req} ${q.title} [${q.questionType}]`);
          console.log(`    → ${cur}`);
        }
      }
      void getOutputFormat;
    } catch (error) {
      handleError(error);
    }
  },
});
