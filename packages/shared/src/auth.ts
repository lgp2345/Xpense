import type { ClientType, PermissionKey } from "./rbac.js";

export type UserStatus = "active" | "disabled";
export type OrganizationStatus = "active" | "disabled";
export type MembershipStatus = "active" | "disabled";

export type CurrentUserResponse = {
  user: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
    status: UserStatus;
  };
  organization: {
    id: string;
    name: string;
  };
  role: {
    id: string;
    key: string;
    name: string;
  };
  permissions: PermissionKey[];
  session: {
    id: string;
    clientType: ClientType;
  };
};

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken?: string;
};

export type MenuItem = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  componentKey: string | null;
  icon: string | null;
  permissionCode: string | null;
  sortOrder: number;
  children: MenuItem[];
};
