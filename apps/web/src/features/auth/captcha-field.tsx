import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "../../components/ui/button";

export type CaptchaFieldProps = {
  svg: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function CaptchaField({ svg, loading, error, onRefresh }: CaptchaFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-9 w-28 shrink-0 overflow-hidden rounded-md border bg-white">
        {svg ? (
          <img alt="验证码" className="h-full w-full" src={toSvgDataUri(svg)} />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {loading ? "加载中..." : (error ?? "验证码")}
          </span>
        )}
      </div>
      <Button
        aria-label="刷新验证码"
        disabled={loading}
        onClick={onRefresh}
        size="icon"
        type="button"
        variant="outline"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </Button>
    </div>
  );
}
