import type { RentalSpaceSearchResult } from "@xpense/shared";

import { Button } from "@/components/ui/button";

export function SpaceSearchResults({
  error,
  items,
  isPending,
  keyword,
  onSelect,
}: {
  error: boolean;
  isPending: boolean;
  items: RentalSpaceSearchResult[];
  keyword: string;
  onSelect: (result: RentalSpaceSearchResult) => void;
}) {
  if (!keyword) return null;
  if (isPending) return <p className="text-xs text-muted-foreground">正在搜索空间...</p>;
  if (error)
    return (
      <p role="alert" className="text-xs text-destructive">
        搜索空间失败，请稍后重试。
      </p>
    );
  if (items.length === 0) return <p className="text-xs text-muted-foreground">未找到匹配空间。</p>;
  return (
    <ul
      aria-label="空间搜索结果"
      className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1"
    >
      {items.map((item) => (
        <li key={item.id}>
          <Button
            className="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left"
            type="button"
            variant="ghost"
            onClick={() => onSelect(item)}
          >
            <span>{item.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {item.path.map((part) => part.name).join(" / ")}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
