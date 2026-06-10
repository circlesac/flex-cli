/**
 * Flex 평가(Check-in) 작성 API — 평가자(reviewer)가 하향 평가를 작성/제출.
 *
 * docs/EVALUATION_API.md 의 리버스 엔지니어링 결과를 그대로 구현.
 * client.ts 와 달리 micro-frontend 헤더가 `remotes-evaluation` 이어야 한다
 * (remotes-people 이면 일부 엔드포인트가 403).
 */

import type { FlexCredentials } from "../types/index.ts";
import { ApiError } from "./errors.ts";

const BASE_URL = "https://flex.team";

function evalHeaders(creds: FlexCredentials): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "flexteam-deviceid": creds.deviceId,
    "flexteam-locale": "ko",
    "flexteam-mf-appname": "remotes-evaluation",
    "flexteam-productcode": "FLEX",
    "x-flex-aid": creds.aid,
    "x-flex-axios": "base",
    Cookie: `JSESSIONID=${creds.jsessionid}; AID=${creds.aid}; DEVICE_ID=${creds.deviceId}; FlexTeam-Locale=ko`,
  };
}

async function call<T = unknown>(
  creds: FlexCredentials,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
  appnameOverride?: string,
): Promise<T> {
  const headers = evalHeaders(creds);
  if (appnameOverride) headers["flexteam-mf-appname"] = appnameOverride;
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new ApiError(`Flex API ${resp.status} ${path} ${text.slice(0, 300)}`, resp.status);
  }
  const text = await resp.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** AID JWT 페이로드에서 평가자 본인 userUuid 추출. */
export function reviewerUuid(creds: FlexCredentials): string {
  const part = creds.aid.split(".")[1];
  if (!part) throw new ApiError("Malformed AID token", 0);
  const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf-8")) as {
    userUuid?: string;
  };
  if (!payload.userUuid) throw new ApiError("AID token missing userUuid", 0);
  return payload.userUuid;
}

export interface EvaluationTodo {
  evaluationId: string;
  stepType: string;
  depth: number;
  title: string;
  due?: string;
}

/** 작성 대기 평가(todo) 발견 — WRITE_EVALUATION_STEP_REQUEST. */
export async function findEvaluationTodos(creds: FlexCredentials): Promise<EvaluationTodo[]> {
  const data = await call<{ assignedTodos?: Array<Record<string, any>> }>(
    creds,
    "POST",
    "/action/v3/todo/assigned-todos/search?size=20&sort=DESC&orderBy=UPDATED_AT",
    {
      condition: "AND",
      filter: { statuses: { selections: ["TODO", "IN_PROGRESS"], condition: "INCLUDE_ALL" } },
    },
    "remotes-home",
  );
  return (data.assignedTodos ?? [])
    .filter((t) => t.type === "WRITE_EVALUATION_STEP_REQUEST")
    .map((t) => {
      const ref = t.reference?.referenceJson ?? {};
      return {
        evaluationId: ref.evaluationId,
        stepType: ref.evaluationStepType,
        depth: ref.evaluationStepDepth,
        title: ref.evaluationTitle,
        due: t.due,
      };
    });
}

export interface RevieweeMapping {
  revieweeIdHash: string;
  name: string;
  userFormIds: string[];
  writingStatus: string;
}

export async function getReviewees(
  creds: FlexCredentials,
  evalId: string,
  step: string,
  depth: number,
): Promise<RevieweeMapping[]> {
  const data = await call<{
    mappings?: Array<{ revieweeIdHash: string; userFormIds: string[]; writingStatus: string }>;
    revieweeUsers?: Array<{ userIdHash: string; displayName?: string; name?: string }>;
  }>(
    creds,
    "GET",
    `/action/v3/evaluation/${evalId}/step/${step}/depth/${depth}/getEvaluationStepNeedsWriting`,
  );
  const names = new Map(
    (data.revieweeUsers ?? []).map((u) => [u.userIdHash, u.displayName ?? u.name ?? u.userIdHash]),
  );
  return (data.mappings ?? []).map((m) => ({
    revieweeIdHash: m.revieweeIdHash,
    name: names.get(m.revieweeIdHash) ?? m.revieweeIdHash,
    userFormIds: m.userFormIds,
    writingStatus: m.writingStatus,
  }));
}

export interface FormElement {
  elementId: string;
  label: string;
  gradeItemId?: string;
}
export interface FormQuestion {
  userFormId: string;
  userAnswerId: string;
  title: string;
  questionType: "SINGLE_SELECT" | "GRADE" | "PLAIN_TEXT" | string;
  required: boolean;
  elements: FormElement[];
  currentAnswer: { elementId?: string; text?: string } | null;
}
export interface UserForm {
  userFormId: string;
  title: string;
  factor: string;
  questions: FormQuestion[];
}

export async function getUserForm(
  creds: FlexCredentials,
  reviewer: string,
  userFormId: string,
): Promise<UserForm> {
  const j = await call<any>(
    creds,
    "GET",
    `/api/v2/form/customers/${creds.customerUuid}/users/${reviewer}/user-forms/${userFormId}?compositeBlocks=true`,
  );
  const questions: FormQuestion[] = [];
  for (const b of j.userBlocks ?? []) {
    if (b.itemType !== "QUESTION") continue;
    const q = b.question;
    questions.push({
      userFormId,
      userAnswerId: b.userAnswer?.userAnswerId,
      title: q.title,
      questionType: q.questionType,
      required: !!q.required,
      elements: (q.elements ?? []).map((e: any) => ({
        elementId: e.elementId,
        label: e.label,
        gradeItemId: e.gradeItemId,
      })),
      currentAnswer: b.userAnswer?.answer ?? null,
    });
  }
  return {
    userFormId,
    title: j.title,
    factor: j.reference?.referenceData?.factor ?? "",
    questions,
  };
}

/** 답안 저장 (PUT). SINGLE_SELECT / GRADE → elementId, PLAIN_TEXT → text. */
export async function putAnswer(
  creds: FlexCredentials,
  reviewer: string,
  userFormId: string,
  userAnswerId: string,
  body: { type: string; answer: { elementId?: string; text?: string } },
): Promise<void> {
  await call(
    creds,
    "PUT",
    `/api/v2/form/customers/${creds.customerUuid}/users/${reviewer}/user-forms/${userFormId}/user-answers/${userAnswerId}`,
    body,
  );
}

export interface GradeItem {
  gradeItemId: string;
  name: string;
  systemScore: number;
}

/** CUSTOM 팩터 등급 옵션 (systemScore: A=4, B=3, C=2, Poor=1). */
export async function getCustomGradeItems(
  creds: FlexCredentials,
  evalId: string,
  step: string,
  depth: number,
): Promise<GradeItem[]> {
  const j = await call<any>(
    creds,
    "GET",
    `/action/v3/evaluation/${evalId}/step/${step}/depth/${depth}/factor/CUSTOM/grade-footer-setting`,
  );
  return (j.grade?.items ?? []).map((i: any) => ({
    gradeItemId: i.gradeItemId,
    name: i.name,
    systemScore: i.systemScore,
  }));
}

/** CUSTOM 팩터 reviewer-grade 설정 (PATCH) — 제출 게이트. */
export async function patchCustomGrade(
  creds: FlexCredentials,
  evalId: string,
  reviewee: string,
  reviewer: string,
  step: string,
  depth: number,
  gradeItemId: string,
): Promise<void> {
  await call(
    creds,
    "PATCH",
    `/api/v3/evaluation/${evalId}/reviewee/${reviewee}/reviewer/${reviewer}/grades/step/${step}/depth/${depth}/factorType/CUSTOM`,
    { gradeItemId, patchFields: ["GRADE_ITEM_IDENTITY"] },
  );
}

/** 현재 CUSTOM reviewer-grade gradeItemId (없으면 null). */
export async function getCustomGrade(
  creds: FlexCredentials,
  evalId: string,
  reviewee: string,
  reviewer: string,
  step: string,
  depth: number,
): Promise<string | null> {
  const j = await call<any>(
    creds,
    "GET",
    `/api/v3/evaluation/${evalId}/reviewee/${reviewee}/reviewer/${reviewer}/grades/step/${step}/depth/${depth}/factorType/CUSTOM`,
  );
  return j.evaluationReviewerGrade?.gradeItemId ?? null;
}

/** 제출 (비가역). writingStatus → SUBMITTED. */
export async function submitReviewee(
  creds: FlexCredentials,
  evalId: string,
  reviewee: string,
  reviewer: string,
  step: string,
  depth: number,
): Promise<void> {
  await call(
    creds,
    "POST",
    `/action/v3/evaluation/${evalId}/steps/${step}/depth/${depth}/reviewers/${reviewer}/reviewee/${reviewee}/submission`,
    { type: "SUBMIT" },
  );
}
