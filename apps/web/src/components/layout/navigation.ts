import type { ROUTE_DEFINITIONS, RouteKey } from "@xpense/shared";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = {
  title: string;
  to: (typeof ROUTE_DEFINITIONS)[RouteKey]["path"];
  icon: LucideIcon;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};
