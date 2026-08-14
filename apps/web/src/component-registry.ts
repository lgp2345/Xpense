import { lazy } from "react";

export const COMPONENT_REGISTRY = {
  DashboardPage: lazy(() =>
    import("~/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })),
  ),
  MembersPage: lazy(() =>
    import("~/features/members/members-page").then((module) => ({ default: module.MembersPage })),
  ),
  RolesPage: lazy(() =>
    import("~/features/roles/roles-page").then((module) => ({ default: module.RolesPage })),
  ),
  SessionsPage: lazy(() =>
    import("~/features/sessions/sessions-page").then((module) => ({
      default: module.SessionsPage,
    })),
  ),
  AuditLogsPage: lazy(() =>
    import("~/features/audit/audit-logs-page").then((module) => ({
      default: module.AuditLogsPage,
    })),
  ),
} as const;

export type ComponentKey = keyof typeof COMPONENT_REGISTRY;
