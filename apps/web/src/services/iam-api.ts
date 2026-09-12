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

/** 通过 type 与 isExternal 区分目录、内部菜单、外链和按钮各自允许的字段。 */
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

/**
 * 封装成员、角色、菜单、权限与审计接口，统一处理路径和请求参数映射。
 * 遵循服务端动作式协议：写操作使用 POST，资源 ID 通常放入请求体。
 * 普通组织范围接口由服务端从认证上下文确定组织，重置菜单等显式目标操作除外。
 *
 * @param client 由当前会话组装的请求客户端。
 * @returns 权限管理领域接口；不直接维护页面或会话状态。
 */
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
    editRole: (input: EditRoleActionRequest) =>
      client.post<IamRole>("/roles/update", {
        id: input.roleId,
        name: input.name,
        description: input.description,
      }),
    /** 权限变更使用独立端点，与角色名称、描述等元数据更新分开。 */
    editRolePermissions: (input: EditRolePermissionsRequest) =>
      client.post<void>("/roles/permissions/edit", input),
    /** 关闭网络自动重试，让菜单状态及时反映失败；仍保留客户端的认证刷新机制。 */
    getAuthorizedMenus: () => client.get<AuthorizedMenuNode[]>("/menus", { retry: false }),
    resolveMenuRoute: (path: string) =>
      client.get<AuthorizedMenuNode>(`/menus/resolve?path=${encodeURIComponent(path)}`),
    getMenuConfiguration: () => client.get<MenuConfigurationNode[]>("/menus/configuration"),
    addMenu: (input: AddMenuRequest) => client.post<void>("/menus/add", input),
    editMenu: (input: EditMenuRequest) => client.post<void>("/menus/edit", input),
    deleteMenu: (id: number) => client.post<void>("/menus/delete", { id }),
    editMenuOrder: (id: number, direction: "up" | "down") =>
      client.post<void>("/menus/edit-order", { id, direction }),
    listPermissions: () => client.get<IamPermission[]>("/permissions/list"),
    getPermissionTree: () => client.get<PermissionTreeNode[]>("/permissions/tree"),
    resetOrganizationMenus: (organizationId: string) =>
      client.post<void>("/organizations/menus/reset", { organizationId }),
    listAuditLogs: (query: ListAuditLogsQuery = {}) =>
      client.get<AuditLogRecord[]>(`/audit-logs/list${toQueryString(query)}`),
  };
}

/** 将审计筛选编码为查询串，日期转换为 UTC ISO 字符串，省略 undefined 字段。 */
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
