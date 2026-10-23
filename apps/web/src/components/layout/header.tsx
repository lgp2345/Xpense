import { Search, SunMoon } from "lucide-react";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSearch } from "@/context/search-provider";
import { useTheme } from "@/context/theme-provider";
import type { WebSessionDependency } from "@/services/web-session";

export function Header({ session }: { session: WebSessionDependency }) {
  const scope = useStore(session.authStore, (state) => state.accessScope);
  const { setOpen } = useSearch();
  const { setTheme, theme } = useTheme();
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="ml-auto flex items-center gap-3">
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
      </div>
    </header>
  );
}
