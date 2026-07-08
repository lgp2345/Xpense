import { organizationMemberships, permissions, roles, users } from "../../db/schema.js";

export const memberSelectFields = {
  id: organizationMemberships.id,
  organizationId: organizationMemberships.organizationId,
  userId: organizationMemberships.userId,
  email: users.email,
  roleId: roles.id,
  roleKey: roles.key,
  roleName: roles.name,
  status: organizationMemberships.status,
  joinedAt: organizationMemberships.joinedAt,
};

export const roleSelectFields = {
  id: roles.id,
  organizationId: roles.organizationId,
  key: roles.key,
  name: roles.name,
  description: roles.description,
  isSystem: roles.isSystem,
  isEditable: roles.isEditable,
};

export const permissionSelectFields = {
  id: permissions.id,
  key: permissions.key,
  name: permissions.name,
  resource: permissions.resource,
  action: permissions.action,
  description: permissions.description,
};
