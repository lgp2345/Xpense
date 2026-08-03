import { ChevronsUpDown, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { logoutWebSession, type WebSessionDependency } from "@/services/web-session";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function NavUser({ session }: { session: WebSessionDependency }) {
  const { authApi, authStore } = session;
  const isMobile = useSidebar().isMobile;
  const user = useStore(authStore, (state) => state.currentUser);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const email = user?.email ?? "未登录";
  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutWebSession(authApi, authStore);
    } catch {
      toast.error("退出登录失败，请稍后重试。");
    } finally {
      setIsLoggingOut(false);
    }
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar>
                <AvatarFallback>{initials(email)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{email}</span>
                <span className="truncate text-xs">当前账号</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
            className="min-w-56"
          >
            <DropdownMenuLabel>{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isLoggingOut}
              variant="destructive"
              onSelect={() => void handleLogout()}
            >
              <LogOut />
              {isLoggingOut ? "正在退出..." : "退出登录"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
