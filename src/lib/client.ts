import type {
  FlexCredentials,
  SearchUsersResponse,
  DocumentSearchResponse,
  TemplatePolicyResponse,
  TemplateOption,
  FlexDepartment,
  DepartmentUserCount,
  FlexCalendar,
  CoworkerCalendarsResponse,
  CalendarEventsResponse,
  FlexEventType,
  NotificationTopicsResponse,
  UnreadCountResponse,
} from "../types/index.ts";
import { ApiError } from "./errors.ts";

const BASE_URL = "https://flex.team";

function buildHeaders(creds: FlexCredentials): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "flexteam-deviceid": creds.deviceId,
    "flexteam-locale": "ko",
    "flexteam-mf-appname": "remotes-people",
    "flexteam-mf-appversion": "v2.2026-02-25.2",
    "flexteam-productcode": "FLEX",
    "x-flex-aid": creds.aid,
    "x-flex-axios": "base",
    Cookie: `JSESSIONID=${creds.jsessionid}; AID=${creds.aid}; DEVICE_ID=${creds.deviceId}; FlexTeam-Locale=ko`,
  };
}

export async function searchUsers(
  creds: FlexCredentials,
  filter: {
    departmentIdHashes?: string[];
  } = {},
  size = 500,
): Promise<SearchUsersResponse> {
  const url = `${BASE_URL}/action/v2/search/customers/${creds.customerUuid}/time-series/search-users?size=${size}`;

  const body = {
    sort: { sortType: "DISPLAY_NAME", directionType: "ASC" },
    filter: {
      userStatuses: ["IN_EMPLOY", "IN_APPRENTICESHIP"],
      departmentIdHashes: filter.departmentIdHashes ?? [],
      jobTitleIdHashes: [],
      jobRankIdHashes: [],
      jobRoleIdHashes: [],
      jobGroupIdHashes: [],
      headUsers: [],
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return (await resp.json()) as SearchUsersResponse;
}

export async function searchDocuments(
  creds: FlexCredentials,
  filter: {
    statuses?: string[];
    templateKeys?: string[];
  } = {},
  search: { keyword?: string; type?: string } = {},
  size = 20,
): Promise<DocumentSearchResponse> {
  const url = `${BASE_URL}/action/v3/approval-document/user-boxes/search?size=${size}&sortType=LAST_UPDATED_AT&direction=DESC`;

  const body = {
    filter: {
      statuses: filter.statuses ?? ["IN_PROGRESS"],
      approvalRequired: false,
      templateKeys: filter.templateKeys ?? [],
      writerHashedIds: [],
      approverTargets: [],
      referrerTargets: [],
      starred: false,
    },
    search: {
      keyword: search.keyword ?? "",
      type: search.type ?? "ALL",
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return (await resp.json()) as DocumentSearchResponse;
}

export async function getDocument(
  creds: FlexCredentials,
  documentKey: string,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/${documentKey}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: buildHeaders(creds),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return await resp.json();
}

/** Edit an existing (already-submitted) approval document in place. The
 *  document resource allows `PUT` (verified via OPTIONS: PUT,DELETE,GET,
 *  HEAD,OPTIONS) — this is the "수정" action. The `draft` endpoint rejects
 *  submitted documents with WORKFLOW_400_022 "이미 작성한 문서입니다", so PUT
 *  is the only edit path. Body must be `{ document: {...} }` ONLY — including
 *  `approvalProcess` is rejected with APPROVAL_400_028 "변경될 수 없는 승인라인이에요"
 *  because the approval line is locked after submit. Editing this way keeps
 *  existing approvals intact (no step reset). */
export async function editDocument(
  creds: FlexCredentials,
  documentKey: string,
  body: unknown,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/${documentKey}`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }

  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/** Add a comment to an approval document. The Flex API wraps the payload
 *  in a `comment` envelope; the server generates the id, writer, and
 *  timestamps. `content` is plain text (newlines preserved). */
export async function createComment(
  creds: FlexCredentials,
  documentKey: string,
  content: string,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/${documentKey}/comments`;
  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify({ comment: { content } }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/** Edit an existing comment. `commentId` is the comment's `idHash`. */
export async function updateComment(
  creds: FlexCredentials,
  documentKey: string,
  commentId: string,
  content: string,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/${documentKey}/comments/${commentId}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: buildHeaders(creds),
    body: JSON.stringify({ comment: { content } }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/** Delete a comment. `commentId` is the comment's `idHash`. */
export async function deleteComment(
  creds: FlexCredentials,
  documentKey: string,
  commentId: string,
): Promise<void> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/${documentKey}/comments/${commentId}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(creds),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
}

export async function resolvePolicy(
  creds: FlexCredentials,
  templateKey: string,
): Promise<TemplatePolicyResponse> {
  const url = `${BASE_URL}/action/v3/approval-document-template/templates/${templateKey}/resolve-policy`;

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return (await resp.json()) as TemplatePolicyResponse;
}

export interface PresignedUrlResponse {
  fileKey: string;
  uploadUrl: string;
  uploadMethod: string;
  name: string;
  mimeType: string;
  size: number;
  sourceType: string;
}

export async function requestPresignedUrl(
  creds: FlexCredentials,
  params: {
    name: string;
    size: number;
    mimeType: string;
    sourceType?: string;
    sensitiveFile?: boolean;
  },
): Promise<PresignedUrlResponse> {
  const url = `${BASE_URL}/api/v2/file/users/me/files/temporary/pre-signed-url`;
  const body = {
    name: params.name,
    size: params.size,
    mimeType: params.mimeType,
    sourceType: params.sourceType ?? "WORKFLOW_IN_EDITOR_FILE",
    sensitiveFile: params.sensitiveFile ?? false,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
  return (await resp.json()) as PresignedUrlResponse;
}

export async function uploadToPresignedUrl(
  uploadUrl: string,
  data: ArrayBuffer,
  mimeType: string,
): Promise<void> {
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: data,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `S3 PUT returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
}

export async function verifyTemporaryFile(
  creds: FlexCredentials,
  fileKey: string,
): Promise<void> {
  const url = `${BASE_URL}/api/v2/file/users/me/files/temporary/${fileKey}/pre-signed-url/verify`;
  const resp = await fetch(url, {
    method: "GET",
    headers: buildHeaders(creds),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
}

export async function convertTemporaryToContentFile(
  creds: FlexCredentials,
  temporaryFileKey: string,
): Promise<{ url: string; fileKey: string }> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/content/files`;
  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify({ temporaryFileKey }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
  return (await resp.json()) as { url: string; fileKey: string };
}

export async function draftDocument(
  creds: FlexCredentials,
  documentKey: string,
  body: unknown,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/draft?documentKey=${documentKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }

  return await resp.json();
}

export async function submitDocument(
  creds: FlexCredentials,
  body: unknown,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents`;

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }

  return await resp.json();
}

export async function listDrafts(
  creds: FlexCredentials,
): Promise<Array<{
  document: {
    documentKey: string;
    templateKey: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
  };
  lastModifiedAt?: string;
}>> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/draft`;

  const resp = await fetch(url, {
    method: "GET",
    headers: buildHeaders(creds),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }

  const data = (await resp.json()) as {
    drafts?: Array<{
      document: {
        documentKey: string;
        templateKey: string;
        title: string;
        createdAt?: string;
        updatedAt?: string;
      };
      lastModifiedAt?: string;
    }>;
  };
  return data.drafts ?? [];
}

export async function deleteDraft(
  creds: FlexCredentials,
  documentKey: string,
): Promise<void> {
  const url = `${BASE_URL}/api/v3/approval-document/approval-documents/draft?documentKey=${documentKey}`;

  const resp = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(creds),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
}

export async function getTemplates(
  creds: FlexCredentials,
): Promise<TemplateOption[]> {
  const url = `${BASE_URL}/api/v3/approval-document-template/templates`;

  const resp = await fetch(url, {
    method: "GET",
    headers: buildHeaders(creds),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  const data = (await resp.json()) as { templates: TemplateOption[] };
  return data.templates;
}

export async function getDepartments(
  creds: FlexCredentials,
): Promise<FlexDepartment[]> {
  const url = `${BASE_URL}/action/v2/core/departments/search`;

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify({ customerIdHashes: [creds.customerUuid] }),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return (await resp.json()) as FlexDepartment[];
}

export async function getDepartmentUserCounts(
  creds: FlexCredentials,
): Promise<DepartmentUserCount[]> {
  const url = `${BASE_URL}/action/v2/search/department-users/time-series/count-by-department`;

  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return (await resp.json()) as DepartmentUserCount[];
}

export async function getPrimaryCalendar(
  creds: FlexCredentials,
): Promise<FlexCalendar> {
  const url = `${BASE_URL}/api/v2/calendar/calendars/primary`;
  const resp = await fetch(url, { method: "GET", headers: buildHeaders(creds) });
  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }
  return (await resp.json()) as FlexCalendar;
}

export async function getCoworkerCalendars(
  creds: FlexCredentials,
  size = 5000,
): Promise<CoworkerCalendarsResponse> {
  const url = `${BASE_URL}/api/v2/calendar/calendars/coworkers?size=${size}`;
  const resp = await fetch(url, { method: "GET", headers: buildHeaders(creds) });
  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }
  return (await resp.json()) as CoworkerCalendarsResponse;
}

export async function getUserCalendar(
  creds: FlexCredentials,
  userIdHash: string,
): Promise<FlexCalendar> {
  const url = `${BASE_URL}/api/v2/calendar/calendars/users/${userIdHash}`;
  const resp = await fetch(url, { method: "GET", headers: buildHeaders(creds) });
  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }
  return (await resp.json()) as FlexCalendar;
}

export interface CalendarEventQuery {
  calendarIds: string[];
  dateTimeMin: string;
  dateTimeMaxExclusive: string;
  timeZone?: string;
  flexEventTypes?: FlexEventType[];
  statuses?: string[];
  size?: number;
}

export async function getCalendarEvents(
  creds: FlexCredentials,
  q: CalendarEventQuery,
): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams({
    dateTimeMin: q.dateTimeMin,
    dateTimeMaxExclusive: q.dateTimeMaxExclusive,
    timeZone: q.timeZone ?? "Asia/Seoul",
    size: String(q.size ?? 500),
  });
  for (const t of q.flexEventTypes ??
    ["TIME_OFF", "WORK_RECORD", "ONE_ON_ONE", "INTERVIEW", "BIRTHDAY", "COMPANY_JOIN_DAY"])
    params.append("flexEventTypes", t);
  for (const s of q.statuses ?? ["CONFIRMED", "TENTATIVE"])
    params.append("statuses", s);

  const url = `${BASE_URL}/api/v2/calendar/calendars/events?${params}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify({ calendarIds: q.calendarIds }),
  });
  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }
  // The API can return null body when no events exist
  const text = await resp.text();
  if (!text || text === "null") return { hasNext: false, list: [] };
  return JSON.parse(text) as CalendarEventsResponse;
}

export async function getNotificationUnreadCount(
  creds: FlexCredentials,
): Promise<UnreadCountResponse> {
  const url = `${BASE_URL}/action/v2/notification/topics/count-unread`;
  const resp = await fetch(url, { method: "GET", headers: buildHeaders(creds) });
  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }
  return (await resp.json()) as UnreadCountResponse;
}

export async function listNotificationTopics(
  creds: FlexCredentials,
  size = 20,
): Promise<NotificationTopicsResponse> {
  const url = `${BASE_URL}/api/v2/notification/topics?size=${size}`;
  const resp = await fetch(url, { method: "GET", headers: buildHeaders(creds) });
  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }
  return (await resp.json()) as NotificationTopicsResponse;
}

export async function markNotificationsRead(
  creds: FlexCredentials,
  topicIds?: string[],
): Promise<void> {
  const url = `${BASE_URL}/action/v2/notification/topics/read`;
  const body = topicIds && topicIds.length > 0 ? { topicIds } : {};
  const resp = await fetch(url, {
    method: "PUT",
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new ApiError(
      `Flex API returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
}

export async function getMe(
  creds: FlexCredentials,
): Promise<unknown> {
  const url = `${BASE_URL}/api/v2/core/users/me/workspace-users-corp-group-affiliates`;

  const resp = await fetch(url, {
    method: "GET",
    headers: buildHeaders(creds),
  });

  if (!resp.ok) {
    throw new ApiError(
      `Flex API returned ${resp.status}: ${resp.statusText}`,
      resp.status,
    );
  }

  return await resp.json();
}
