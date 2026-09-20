import { X } from "lucide-react";
import { type JSX, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PageTabItem = {
  href: string;
  identity: string;
  title: string;
};

type PageTabsProps = {
  activeIdentity: string | null;
  onActivate: (identity: string) => void;
  onClose: (identity: string) => void;
  tabs: readonly PageTabItem[];
};

export function PageTabs({
  activeIdentity,
  onActivate,
  onClose,
  tabs,
}: PageTabsProps): JSX.Element | null {
  const scrollActiveTabIntoView = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  if (tabs.length === 0) {
    return null;
  }

  const canClose = tabs.length > 1;

  return (
    <nav aria-label="已打开页面" className="overflow-x-auto border-b border-border bg-muted/30">
      <div className="flex h-10 min-w-max items-end gap-1 px-2 pt-1">
        {tabs.map((tab) => {
          const isActive = tab.identity === activeIdentity;

          return (
            <div
              className={cn(
                "group flex h-9 max-w-56 items-center rounded-t-md border border-b-0 border-transparent text-sm text-muted-foreground",
                isActive
                  ? "border-border bg-background text-foreground"
                  : "hover:bg-accent/70 hover:text-foreground",
              )}
              data-active={isActive || undefined}
              key={tab.identity}
              ref={isActive ? scrollActiveTabIntoView : undefined}
            >
              <button
                aria-current={isActive ? "page" : undefined}
                className="h-full min-w-0 flex-1 truncate px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onActivate(tab.identity)}
                title={tab.title}
                type="button"
              >
                {tab.title}
              </button>
              <Button
                aria-label={`关闭“${tab.title}”`}
                className="mr-1 size-6 rounded-sm opacity-60 hover:opacity-100"
                disabled={!canClose}
                onClick={() => onClose(tab.identity)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
