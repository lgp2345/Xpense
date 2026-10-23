import type { PermissionKey } from "@xpense/shared";

export type IamMember = {
  /** 仅成员列表返回，同一次查询中的有效负责人总数。 */
  effectiveOwnerCount?: number;
  userStatus?: "active" | "disabled";
  id: string;
  organizationId: string;
  userId: string;
  username: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  roles?: IamMemberRole[];
  status: "active" | "disabled";
  joinedAt: Date;
};

export type IamMemberRole = {
  id: string;
  key: string;
  name: string;
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

export type IamPermission = {
  id: string;
  key: PermissionKey;
  name: string;
  resource: string;
  action: string;
  description: string;
};

export type CreateMemberInput = {
  organizationId: string;
  userId: string;
  roleId: string;
  roleIds?: string[];
  status: "active";
};

export type UpdateMemberInput = {
  organizationId: string;
  memberId: string;
  roleId?: string;
  roleIds?: string[];
  status?: "active" | "disabled";
};

export type CreateRoleInput = {
  organizationId: string;
  key: string;
  name: string;
  description?: string;
};

export type UpdateRoleInput = {
  organizationId: string;
  roleId: string;
  name?: string;
  description?: string;
};

export type ReplaceRolePermissionsInput = {
  roleId: string;
  permissionKeys: PermissionKey[];
};
