import type {
  AuthorizedMenuNode,
  MenuConfigurationNode,
  MenuIconKey,
  PermissionKey,
  PermissionTreeNode,
  RouteKey,
} from "@xpense/shared";

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

type MenuInputBase = {
  name: string;
  parentId: number | null;
};

type DirectoryMenuInput = MenuInputBase & {
  type: "directory";
  icon: MenuIconKey | null;
  isVisible: boolean;
};

type InternalMenuInput = MenuInputBase & {
  type: "menu";
  routeKey: RouteKey;
  icon: MenuIconKey | null;
  permissionCode: PermissionKey;
  isExternal: false;
  isVisible: boolean;
  keepAlive: boolean;
};

type ExternalMenuInput = MenuInputBase & {
  type: "menu";
  url: string;
  icon: MenuIconKey | null;
  permissionCode: PermissionKey;
  isExternal: true;
  isVisible: boolean;
};

type ButtonMenuInput = Omit<MenuInputBase, "parentId"> & {
  type: "button";
  parentId: number;
  permissionCode: PermissionKey;
};

export type AddMenuRequest =
  | DirectoryMenuInput
  | InternalMenuInput
  | ExternalMenuInput
  | ButtonMenuInput;

export type EditMenuRequest = AddMenuRequest & { id: number };

export type EditRoleActionRequest = {
  roleId: string;
  name?: string;
  description?: string;
};

export type EditRolePermissionsRequest = {
  roleId: string;
  permissionKeys: PermissionKey[];
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
    listMembers: () => client.get<IamMember[]>("/members"),
    createMember: (input: CreateMemberRequest) => client.post<IamMember>("/members", input),
    updateMember: (memberId: string, input: UpdateMemberRequest) =>
      client.patch<IamMember>(`/members/${encodeURIComponent(memberId)}`, input),
    listRoles: () => client.get<IamRoleWithPermissions[]>("/roles"),
    createRole: (input: CreateRoleRequest) => client.post<IamRole>("/roles", input),
    updateRole: (roleId: string, input: UpdateRoleRequest) =>
      client.patch<IamRole>(`/roles/${encodeURIComponent(roleId)}`, input),
    deleteRole: (roleId: string) => client.delete<void>(`/roles/${encodeURIComponent(roleId)}`),
    getAuthorizedMenus: () => client.get<AuthorizedMenuNode[]>("/menus", { retry: false }),
    resolveMenuRoute: (path: string) =>
      client.get<AuthorizedMenuNode>(`/menus/resolve?path=${encodeURIComponent(path)}`),
    getMenuConfiguration: () => client.get<MenuConfigurationNode[]>("/menus/configuration"),
    addMenu: (input: AddMenuRequest) => client.post<void>("/menus/add", input),
    editMenu: (input: EditMenuRequest) => client.post<void>("/menus/edit", input),
    deleteMenu: (id: number) => client.post<void>("/menus/delete", { id }),
    editMenuOrder: (id: number, direction: "up" | "down") =>
      client.post<void>("/menus/edit-order", { id, direction }),
    listPermissions: () => client.get<IamPermission[]>("/permissions"),
    getPermissionTree: () => client.get<PermissionTreeNode[]>("/permissions/tree"),
    editRole: (input: EditRoleActionRequest) => client.post<IamRole>("/roles/edit", input),
    editRolePermissions: (input: EditRolePermissionsRequest) =>
      client.post<void>("/roles/permissions/edit", input),
    resetOrganizationMenus: (organizationId: string) =>
      client.post<void>("/organizations/menus/reset", { organizationId }),
    listAuditLogs: (query: ListAuditLogsQuery = {}) =>
      client.get<AuditLogRecord[]>(`/audit-logs${toQueryString(query)}`),
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
