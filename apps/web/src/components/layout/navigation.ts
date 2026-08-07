import type { PermissionKey } from "@xpense/shared";
import {
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";

export type NavigationItem = {
  title: string;
  to: "/" | "/members" | "/roles" | "/sessions" | "/audit-logs";
  icon: LucideIcon;
  permission?: PermissionKey;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  { title: "概览", items: [{ title: "仪表盘", to: "/", icon: LayoutDashboard }] },
  {
    title: "访问控制",
    items: [
      { title: "成员", to: "/members", icon: Users, permission: "members:read" },
      { title: "角色", to: "/roles", icon: ShieldCheck, permission: "roles:read" },
    ],
  },
  {
    title: "安全",
    items: [
      { title: "会话", to: "/sessions", icon: MonitorSmartphone, permission: "sessions:read" },
      { title: "审计日志", to: "/audit-logs", icon: ScrollText, permission: "audit_logs:read" },
    ],
  },
];

export function getNavigationGroups({
  isSuperAdmin,
  permissions,
}: {
  isSuperAdmin: boolean;
  permissions: PermissionKey[];
}): NavigationGroup[] {
  const permissionSet = new Set(permissions);
  return navigationGroups.flatMap((group) => {
    const items = group.items.filter(
      (item) => !item.permission || isSuperAdmin || permissionSet.has(item.permission),
    );
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}
