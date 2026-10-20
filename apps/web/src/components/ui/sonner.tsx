import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/context/theme-provider";

export function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      theme={theme}
      position="top-center"
      closeButton
      toastOptions={{
        descriptionClassName: "break-all select-text",
        closeButtonAriaLabel: "关闭提示",
        classNames: {
          toast: "items-start! flex-wrap!",
          content: "min-w-0 flex-1",
          title: "whitespace-pre-wrap [overflow-wrap:anywhere] select-text",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
          "--toast-close-button-start": "auto",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
