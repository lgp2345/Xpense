import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ContractRestrictionTooltip({
  label,
  message,
  children,
}: {
  label: string;
  message: string | null;
  children: ReactNode;
}) {
  if (!message) return children;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <fieldset
            aria-label={label}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: 禁用按钮由外层接收键盘焦点以展示限制原因。
            tabIndex={0}
            className="rounded-md outline-none inline-flex focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {children}
          </fieldset>
        }
      />
      <TooltipContent sideOffset={4}>{message}</TooltipContent>
    </Tooltip>
  );
}
