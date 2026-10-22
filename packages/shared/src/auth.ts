import { z } from "zod";

import type { OrganizationSummary } from "./organizations.js";
import type { ClientType, PermissionKey } from "./rbac.js";

export type {
  AuthorizedMenuNode,
  MenuConfigurationNode,
  MenuIconKey,
  MenuType,
  PermissionTreeNode,
  RouteKey,
} from "./menu.js";

export type UserStatus = "active" | "disabled";
export type OrganizationStatus = "active" | "disabled";
export type MembershipStatus = "active" | "disabled";

export type CurrentUserResponse = {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    isSuperAdmin: boolean;
    initialPasswordUnchanged: boolean;
    status: UserStatus;
  };
  permissions: PermissionKey[];
  session: {
    id: string;
    clientType: ClientType;
  };
} & (
  | { accessScope: "platform"; organization: null; role: null }
  | {
      accessScope: "organization";
      organization: OrganizationSummary;
      role: { id: string; key: string; name: string } | null;
    }
);

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken?: string;
};

export const chinaPhoneRegex = /^1[3-9]\d{9}$/;

export const chinaPhoneSchema = z.string().trim().regex(chinaPhoneRegex, "请输入有效的手机号");

export type CaptchaChallengeResponse = {
  captchaId: string;
  svg: string;
};

/** @deprecated Use AuthorizedMenuNode after menu API consumers migrate. */
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
