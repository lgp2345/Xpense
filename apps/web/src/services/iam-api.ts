import type { MenuItem, PermissionKey } from "@xpense/shared";

import type { ApiClient } from "./api-client";

export type IamMember = {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: "active" | "disabled";
  joinedAt: string;
};

export type CreateMemberRequest = {
  userId: string;
  roleId: string;
};

export type UpdateMemberRequest = {
  roleId?: string;
  status?: "active" | "disabled";
};

export type IamRole = {
  id: string;
  organizationId: string | null;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  isEditable: boolean;
};

export type IamRoleWithPermissions = IamRole & {
  permissionKeys: PermissionKey[];
};

export type CreateRoleRequest = {
  key: string;
  name: string;
  description?: string;
  permissionKeys: PermissionKey[];
};

export type UpdateRoleRequest = {
  name?: string;
  description?: string;
  permissionKeys?: PermissionKey[];
};

export type IamPermission = {
  id: string;
  key: PermissionKey;
  name: string;
  resource: string;
  action: string;
  description: string;
};

export type AuditLogRecord = {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: "succeeded" | "failed";
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
};

export type ListAuditLogsQuery = {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export function createIamApi(client: ApiClient) {
  return {
    listMembers: () => client.get<IamMember[]>("/members/list"),
    createMember: (input: CreateMemberRequest) => client.post<IamMember>("/members/create", input),
    updateMember: (memberId: string, input: UpdateMemberRequest) =>
      client.post<IamMember>("/members/update", { id: memberId, ...input }),
    listRoles: () => client.get<IamRoleWithPermissions[]>("/roles/list"),
    createRole: (input: CreateRoleRequest) => client.post<IamRole>("/roles/create", input),
    updateRole: (roleId: string, input: UpdateRoleRequest) =>
      client.post<IamRole>("/roles/update", { id: roleId, ...input }),
    deleteRole: (roleId: string) => client.post<void>("/roles/delete", { id: roleId }),
    getMenus: () => client.get<MenuItem[]>("/menus"),
    listPermissions: () => client.get<IamPermission[]>("/permissions/list"),
    listAuditLogs: (query: ListAuditLogsQuery = {}) =>
      client.get<AuditLogRecord[]>(`/audit-logs/list${toQueryString(query)}`),
  };
}

function toQueryString(query: ListAuditLogsQuery): string {
  const params = new URLSearchParams();

  appendParam(params, "action", query.action);
  appendParam(params, "actorUserId", query.actorUserId);
  appendParam(params, "targetType", query.targetType);
  appendParam(params, "from", query.from?.toISOString());
  appendParam(params, "to", query.to?.toISOString());
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function appendParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}

export type IamApi = ReturnType<typeof createIamApi>;
