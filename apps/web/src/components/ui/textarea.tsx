import { Field } from "@base-ui/react/field";
import * as React from "react";

import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea">;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  const controlProps = {
    ...props,
    ...(props["aria-label"] !== undefined && props["aria-labelledby"] === undefined
      ? { "aria-labelledby": undefined }
      : {}),
    className: cn(
      "flex min-h-16 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 md:text-sm",
      className,
    ),
    "data-slot": "textarea",
  } as React.ComponentProps<typeof Field.Control>;

  return (
    <Field.Control {...controlProps} ref={ref as React.Ref<HTMLElement>} render={<textarea />} />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
