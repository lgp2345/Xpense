import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Laptop, Moon, Sun } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { getNavigationGroups } from "@/components/layout/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useSearch } from "@/context/search-provider";
import { useTheme } from "@/context/theme-provider";
import type { WebSessionDependency } from "@/services/web-session";

export function CommandMenu({ session }: { session: WebSessionDependency }) {
  const navigate = useNavigate();
  const { open, setOpen } = useSearch();
  const { setTheme } = useTheme();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const navigationGroups = getNavigationGroups({ permissions, isSuperAdmin });
  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="命令菜单">
      <CommandInput placeholder="搜索命令..." />
      <CommandList>
        <CommandEmpty>未找到匹配的命令。</CommandEmpty>
        {navigationGroups.map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) => (
              <CommandItem
                key={item.to}
                value={item.title}
                onSelect={() => runCommand(() => void navigate({ to: item.to }))}
              >
                <ArrowRight className="size-4" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="主题">
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun />
            浅色
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon />
            深色
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Laptop />
            跟随系统
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
