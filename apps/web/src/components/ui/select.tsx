import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type SelectProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Root<string, false>>,
  "value" | "defaultValue" | "onValueChange"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function Select({ children, items, value, defaultValue, onValueChange, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root<string>
      {...props}
      value={value === "" ? null : value}
      defaultValue={defaultValue === "" ? null : defaultValue}
      onValueChange={(nextValue) => onValueChange?.(nextValue ?? "")}
      items={items ?? collectSelectItems(children)}
    >
      {children}
    </SelectPrimitive.Root>
  );
}

/** 弹层尚未挂载时也能展示选中项的文案，保留现有 JSX 选项接口。 */
function collectSelectItems(
  children: React.ReactNode,
): { value: string; label: React.ReactNode }[] {
  const items: { value: string; label: React.ReactNode }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value: string; children?: React.ReactNode }>(child)) return;
    if (child.type === SelectItem)
      items.push({ value: child.props.value, label: child.props.children });
    else items.push(...collectSelectItems(child.props.children));
  });
  return items;
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}
function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 0,
  listProps,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> &
  Pick<React.ComponentProps<typeof SelectPrimitive.Positioner>, "side" | "align" | "sideOffset"> & {
    listProps?: Omit<
      React.ComponentProps<typeof SelectPrimitive.List>,
      "children" | "className"
    > & {
      className?: string;
    };
  }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            {...listProps}
            className={cn(
              "max-h-(--available-height) scroll-py-6 overflow-y-auto p-1",
              listProps?.className,
            )}
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}
function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-highlighted:bg-accent data-disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "inset-x-0 top-0 z-10 flex cursor-default items-center justify-center bg-popover py-1",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}
function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "inset-x-0 bottom-0 z-10 flex cursor-default items-center justify-center bg-popover py-1",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
