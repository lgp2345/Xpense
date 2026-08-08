import { lazy } from "react";

export const COMPONENT_REGISTRY = {
  DashboardPage: lazy(() => import("~/pages/dashboard-page")),
  MembersPage: lazy(() => import("~/features/members/members-page")),
  RolesPage: lazy(() => import("~/features/roles/roles-page")),
  SessionsPage: lazy(() => import("~/features/sessions/sessions-page")),
  AuditLogsPage: lazy(() => import("~/features/audit/audit-logs-page")),
} as const;

export type ComponentKey = keyof typeof COMPONENT_REGISTRY;
