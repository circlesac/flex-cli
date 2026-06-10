import { defineCommand } from "citty";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { requireCredentials } from "../../lib/credentials.ts";
import { FlexError, handleError } from "../../lib/errors.ts";
import {
  getUserForm,
  putAnswer,
  patchCustomGrade,
  getCustomGradeItems,
} from "../../lib/evaluation.ts";
import { resolveContext, findReviewee, checkinContextArgs } from "./common.ts";

interface SetPayload {
  reviewee?: string;
  grade?: "A" | "B" | "C" | "Poor" | string;
  coreValuesAll?: string;
  coreValues?: Record<string, string>;
  strengths?: string;
  improvements?: string;
}

const GRADE_SCORE: Record<string, number> = { A: 4, B: 3, C: 2, Poor: 1 };

export const checkinSetCommand = defineCommand({
  meta: {
    name: "set",
    description: "JSON 페이로드로 평가지 답안 일괄 저장 (초안, 제출 안 함)",
  },
  args: {
    payload: { type: "string", description: "답안 JSON 파일 경로", required: true },
    reviewee: { type: "string", description: "피평가자 (payload.reviewee 대신)" },
    ...checkinContextArgs,
  },
  run: async ({ args }) => {
    try {
      const creds = await requireCredentials();
      const p = resolve(args.payload);
      if (!existsSync(p)) throw new FlexError(`파일 없음: ${p}`, "NO_FILE");
      const payload = JSON.parse(readFileSync(p, "utf-8")) as SetPayload;

      const revName = args.reviewee ?? payload.reviewee;
      if (!revName) throw new FlexError("reviewee 가 필요합니다 (--reviewee 또는 payload.reviewee)", "NO_REVIEWEE");

      const ctx = await resolveContext(creds, args);
      const rv = findReviewee(ctx.reviewees, revName);
      if (rv.writingStatus === "SUBMITTED") {
        throw new FlexError(`${rv.name} 은 이미 제출됨(SUBMITTED). 수정 불가.`, "ALREADY_SUBMITTED");
      }

      const forms = await Promise.all(
        rv.userFormIds.map((id) => getUserForm(creds, ctx.reviewer, id)),
      );
      const done: string[] = [];

      for (const form of forms) {
        for (const q of form.questions) {
          if (q.questionType === "SINGLE_SELECT") {
            const label = payload.coreValues?.[q.title] ?? payload.coreValuesAll;
            if (!label) continue;
            const el = q.elements.find((e) => e.label === label);
            if (!el) throw new FlexError(`"${q.title}" 에 "${label}" 옵션 없음 (가능: ${q.elements.map((e) => e.label).join("/")})`, "BAD_OPTION");
            await putAnswer(creds, ctx.reviewer, form.userFormId, q.userAnswerId, {
              type: "SINGLE_SELECT",
              answer: { elementId: el.elementId },
            });
            done.push(`${q.title} = ${label}`);
          } else if (q.questionType === "GRADE") {
            if (!payload.grade) continue;
            const score = GRADE_SCORE[payload.grade];
            const items = await getCustomGradeItems(creds, ctx.evalId, ctx.step, ctx.depth);
            const item = items.find((i) => i.systemScore === score);
            if (!item) throw new FlexError(`grade "${payload.grade}" 매핑 실패`, "BAD_GRADE");
            const el = q.elements.find((e) => e.gradeItemId === item.gradeItemId);
            if (el) {
              await putAnswer(creds, ctx.reviewer, form.userFormId, q.userAnswerId, {
                type: "GRADE",
                answer: { elementId: el.elementId },
              });
            }
            // 제출 게이트: CUSTOM 팩터 등급 PATCH (필수)
            await patchCustomGrade(
              creds,
              ctx.evalId,
              rv.revieweeIdHash,
              ctx.reviewer,
              ctx.step,
              ctx.depth,
              item.gradeItemId,
            );
            done.push(`최종등급 = ${payload.grade} (${item.name})`);
          } else if (q.questionType === "PLAIN_TEXT") {
            const isStrength = /잘해온|잘한/.test(q.title);
            const text = isStrength ? payload.strengths : payload.improvements;
            if (text === undefined) continue;
            await putAnswer(creds, ctx.reviewer, form.userFormId, q.userAnswerId, {
              type: "PLAIN_TEXT",
              answer: { text },
            });
            done.push(`${q.title} = [${text.length}자]`);
          }
        }
      }

      console.error(`\x1b[32m✓\x1b[0m ${rv.name} 초안 저장 (${done.length}항)`);
      for (const d of done) console.log(`  ${d}`);
      console.error(`\x1b[2m제출하려면: flexhr checkin submit "${rv.name}"\x1b[0m`);
    } catch (error) {
      handleError(error);
    }
  },
});
