import type { PermissionKey } from "@xpense/shared";

export type IamMember = {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: "active" | "disabled";
  joinedAt: Date;
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
  status: "active";
};

export type UpdateMemberInput = {
  organizationId: string;
  memberId: string;
  roleId?: string;
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
