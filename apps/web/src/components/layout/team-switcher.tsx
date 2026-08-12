import { ChevronsUpDown, Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { switchWebOrganization, type WebSessionDependency } from "@/services/web-session";

type Organization = { id: string; name: string };

export function TeamSwitcher({ session }: { session: WebSessionDependency }) {
  const { authApi, authStore } = session;
  const isMobile = useSidebar().isMobile;
  const currentOrganization = useStore(authStore, (state) => state.currentOrganization);
  const currentOrganizationId = currentOrganization?.id ?? null;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (!currentOrganizationId) {
      setOrganizations([]);
      return;
    }
    let active = true;
    void authApi
      .listOrganizations()
      .then((items) => {
        if (active) setOrganizations(items.map(({ id, name }) => ({ id, name })));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authApi, currentOrganizationId]);

  const availableOrganizations = useMemo(
    () =>
      currentOrganization && !organizations.some(({ id }) => id === currentOrganization.id)
        ? [currentOrganization, ...organizations]
        : organizations,
    [currentOrganization, organizations],
  );
  async function handleSwitch(organizationId: string) {
    if (isSwitching || organizationId === currentOrganizationId) return;
    setIsSwitching(true);
    try {
      await switchWebOrganization(authApi, authStore, organizationId);
    } catch {
      toast.error("切换组织失败，请稍后重试。");
    } finally {
      setIsSwitching(false);
    }
  }
  const organizationName = currentOrganization?.name ?? "未选择组织";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <Landmark className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{organizationName}</span>
                <span className="truncate text-xs">当前组织</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
            className="min-w-56"
          >
            <DropdownMenuLabel>切换组织</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableOrganizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                disabled={isSwitching || organization.id === currentOrganizationId}
                onSelect={() => void handleSwitch(organization.id)}
              >
                {organization.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
