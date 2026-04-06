export type OutputFormat = "json" | "plain" | "table";

export interface FlexCredentials {
  jsessionid: string;
  aid: string;
  deviceId: string;
  customerUuid: string;
  exp: number;
}

export interface Department {
  idHash: string;
  code: string;
  name: string;
}

export interface FlexUser {
  customerIdHash: string;
  userIdHash: string;
  basicInfo: {
    name: string;
    email: string;
    displayName: string;
  };
  employeeInfo: {
    departments: Department[];
    jobTitles: { idHash: string; name: string }[];
    jobRanks: { idHash: string; name: string }[];
    jobRoles: { idHash: string; name: string }[];
    jobGroups: { idHash: string; name: string }[];
  };
  tagInfo: {
    userStatuses: string[];
  };
}

export interface SearchUsersResponse {
  hasNext: boolean;
  continuation: string;
  total: {
    relation: string;
    value: number;
  };
  list: FlexUser[];
}

// Approval Document types

export interface ApprovalDocumentInput {
  inputField: {
    name: string;
    type: string;
  };
  value: string;
}

export interface ApprovalDocument {
  documentKey: string;
  title: string;
  code: string;
  status: string;
  inputs: ApprovalDocumentInput[];
  content: string;
  attachments: unknown[];
}

export interface ApprovalActor {
  resolveTarget: {
    type: string;
    value: string;
  };
}

export interface ApprovalLine {
  step: number;
  actors: ApprovalActor[];
}

export interface ApprovalProcess {
  lines: ApprovalLine[];
  referrers: unknown[];
  option: { approvalStepEditEnabled: boolean };
  matchingData: { matchedAt: string; matchHistoryId: string };
}

export interface DocumentSearchItem {
  document: {
    documentKey: string;
    code: string;
    templateKey: string;
    status: string;
    title: string;
    simpleContent: string;
    writer: { idHash: string; name: string };
    writtenAt: string;
    lastUpdatedAt: string;
    inputFields: Array<{
      value: string;
      inputField: { name: string; type: string };
    }>;
  };
  approvalProcess: {
    status: string;
    lines: Array<{
      step: number;
      status: string;
      actor: Array<{ type: string; value: string }>;
    }>;
  };
}

export interface DocumentSearchResponse {
  documents: DocumentSearchItem[];
  hasNext: boolean;
  total: number;
}

export interface TemplatePolicyResponse {
  approvalPolicyMatched: {
    matchMetadata: {
      matchedAt: string;
      matchHistoryId: string;
    };
    lines: ApprovalLine[];
    referrers: unknown[];
  };
}

export interface TemplateOption {
  templateKey: string;
  name: string;
}

export interface MeResponse {
  userIdHash: string;
  name: string;
  email: string;
  customerIdHash: string;
  departments: { name: string }[];
  jobTitles: { name: string }[];
}

export interface FlexDepartment {
  idHash: string;
  parentDepartmentIdHash: string | null;
  name: string;
  code: string;
  visible: boolean;
  displayOrder: number;
}

export interface DepartmentUserCount {
  departmentIdHash: string;
  count: number;
  totalCount: number;
}
