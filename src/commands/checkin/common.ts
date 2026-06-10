import type { FlexCredentials } from "../../types/index.ts";
import { FlexError } from "../../lib/errors.ts";
import {
  findEvaluationTodos,
  getReviewees,
  reviewerUuid,
  type EvaluationTodo,
  type RevieweeMapping,
} from "../../lib/evaluation.ts";

export interface CheckinContext {
  evalId: string;
  step: string;
  depth: number;
  title: string;
  due?: string;
  reviewer: string;
  reviewees: RevieweeMapping[];
}

/**
 * 활성 평가 컨텍스트 해석. --eval/--step/--depth 로 직접 지정하거나,
 * 없으면 작성 대기 todo 에서 자동 발견(여러 개면 에러).
 */
export async function resolveContext(
  creds: FlexCredentials,
  args: { eval?: string; step?: string; depth?: string },
): Promise<CheckinContext> {
  const reviewer = reviewerUuid(creds);
  let evalId = args.eval;
  let step = args.step ?? "TOP_DOWN";
  let depth = args.depth ? Number(args.depth) : 1;
  let title = "";
  let due: string | undefined;

  if (!evalId) {
    const todos = await findEvaluationTodos(creds);
    if (todos.length === 0) {
      throw new FlexError(
        "작성 대기중인 평가가 없습니다. --eval <evaluationId> 로 직접 지정하세요.",
        "NO_EVALUATION",
      );
    }
    if (todos.length > 1) {
      const list = todos
        .map((t: EvaluationTodo) => `  ${t.evaluationId}  ${t.title} (${t.stepType}/${t.depth})`)
        .join("\n");
      throw new FlexError(`작성 대기 평가가 여러 개입니다. --eval 로 지정하세요:\n${list}`, "AMBIGUOUS");
    }
    const t = todos[0]!;
    evalId = t.evaluationId;
    step = t.stepType;
    depth = t.depth;
    title = t.title;
    due = t.due;
  }

  const reviewees = await getReviewees(creds, evalId, step, depth);
  return { evalId, step, depth, title, due, reviewer, reviewees };
}

/** 이름(부분일치) 또는 idHash 로 피평가자 찾기. */
export function findReviewee(reviewees: RevieweeMapping[], query: string): RevieweeMapping {
  const q = query.toLowerCase();
  const matches = reviewees.filter(
    (r) => r.revieweeIdHash === query || r.name.toLowerCase().includes(q),
  );
  if (matches.length === 0) {
    throw new FlexError(
      `피평가자를 찾을 수 없습니다: "${query}". 가능: ${reviewees.map((r) => r.name).join(", ")}`,
      "NO_REVIEWEE",
    );
  }
  if (matches.length > 1) {
    throw new FlexError(
      `"${query}" 가 여러 명과 일치: ${matches.map((r) => r.name).join(", ")}`,
      "AMBIGUOUS_REVIEWEE",
    );
  }
  return matches[0]!;
}

export const checkinContextArgs = {
  eval: { type: "string" as const, description: "Evaluation ID (생략 시 todo 자동 발견)" },
  step: { type: "string" as const, description: "Step type (default: TOP_DOWN)" },
  depth: { type: "string" as const, description: "Step depth (default: 1)" },
};
