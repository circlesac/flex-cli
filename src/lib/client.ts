import type {
  FlexCredentials,
  SearchUsersResponse,
  DocumentSearchResponse,
  TemplatePolicyResponse,
  TemplateOption,
  FlexDepartment,
  DepartmentUserCount,
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
