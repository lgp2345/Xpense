import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

type LoadMoreButtonProps = Omit<ComponentProps<typeof Button>, "type"> & {
  pending?: boolean;
  pendingLabel?: string;
};

export function LoadMoreButton({
  pending = false,
  pendingLabel,
  disabled,
  children = "加载更多",
  ...props
}: LoadMoreButtonProps) {
  return (
    <Button
      variant="outline"
      {...props}
      type="button"
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
