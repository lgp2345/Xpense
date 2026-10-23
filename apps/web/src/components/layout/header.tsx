import { useNavigate } from "@tanstack/react-router";
import { Search, SunMoon } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSearch } from "@/context/search-provider";
import { useTheme } from "@/context/theme-provider";
import { toast } from "@/lib/toast";
import { returnWebSessionToPlatform, type WebSessionDependency } from "@/services/web-session";

export function Header({ session }: { session: WebSessionDependency }) {
  const scope = useStore(session.authStore, (state) => state.accessScope);
  const superAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const organization = useStore(session.authStore, (state) => state.currentOrganization);
  const [returning, setReturning] = useState(false);
  const navigate = useNavigate();
  async function returnToPlatform() {
    if (returning) return;
    setReturning(true);
    try {
      await returnWebSessionToPlatform(session);
      if (session.authStore.getState().accessScope === "platform")
        void navigate({ to: "/platform/organizations", search: { page: 1, pageSize: 20 } });
    } catch (error) {
      toast.error(error, "返回平台失败，请稍后重试。");
    } finally {
      setReturning(false);
    }
  }
  const { setOpen } = useSearch();
  const { setTheme, theme } = useTheme();
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="block truncate">
          {scope === "platform" ? "平台管理" : superAdmin ? organization?.name : ""}
        </span>
        {superAdmin ? <span className="text-xs text-muted-foreground">平台超级管理员</span> : null}
      </div>
      {superAdmin && scope !== "platform" ? (
        <Button
          variant="outline"
          size="sm"
          aria-busy={returning}
          onClick={() => void returnToPlatform()}
        >
          {returning ? "正在返回…" : "返回平台"}
        </Button>
      ) : null}
      {scope !== "platform" ? (
        <Button variant="ghost" size="icon" aria-label="搜索命令" onClick={() => setOpen(true)}>
          <Search />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label="切换主题"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <SunMoon />
      </Button>
    </header>
  );
}
