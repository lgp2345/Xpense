import { format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const Calendar = React.lazy(() =>
  import("@/components/ui/calendar").then((module) => ({ default: module.Calendar })),
);

type DatePickerInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value?: string;
  onChange?: (value: string | undefined) => void;
  buttonLabel?: string;
  withTime?: boolean;
};

// Adapted from Shadcn Studio date-picker-04 (input) and date-picker-10 (time).
// https://github.com/shadcnstudio/shadcn-studio/tree/main/src/components/shadcn-studio/date-picker
export function DatePickerInput({
  value,
  onChange,
  placeholder,
  buttonLabel = "选择日期",
  withTime = false,
  onBlur,
  onKeyDown,
  disabled,
  readOnly,
  className,
  ...inputProps
}: DatePickerInputProps) {
  const displayFormat = withTime ? "yyyy/MM/dd HH:mm" : "yyyy/MM/dd";
  const valueFormat = withTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";
  const selectedDate = parseStrictDate(value ?? "", valueFormat);
  const displayValue = selectedDate ? format(selectedDate, displayFormat) : "";
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(displayValue);
  const [previousValue, setPreviousValue] = React.useState(value);
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate);

  if (value !== previousValue) {
    setPreviousValue(value);
    setText(displayValue);
    setMonth(selectedDate);
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) setMonth(selectedDate ?? new Date());
  }

  function commit(date: Date | undefined) {
    setText(date ? format(date, displayFormat) : "");
    onChange?.(date ? format(date, valueFormat) : undefined);
  }

  return (
    <div className="relative flex min-w-0 gap-2">
      <Input
        {...inputProps}
        disabled={disabled}
        readOnly={readOnly}
        value={text}
        placeholder={placeholder ?? displayFormat}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          if (!next) {
            onChange?.(undefined);
            return;
          }
          const date = parseStrictDate(next, displayFormat) ?? parseStrictDate(next, valueFormat);
          if (date) {
            setMonth(date);
            onChange?.(format(date, valueFormat));
          }
        }}
        onBlur={(event) => {
          setText(displayValue);
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === "ArrowDown" && !event.defaultPrevented && !readOnly) {
            event.preventDefault();
            changeOpen(true);
          }
        }}
        className={cn("bg-background pr-10", className)}
      />
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || readOnly}
            aria-label={buttonLabel}
            className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
          >
            <CalendarIcon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="end"
          alignOffset={-8}
          sideOffset={10}
        >
          <React.Suspense
            fallback={<p className="p-3 text-sm text-muted-foreground">正在加载日历…</p>}
          >
            <Calendar
              mode="single"
              locale={zhCN}
              captionLayout="dropdown"
              startMonth={new Date(1900, 0)}
              endMonth={new Date(2100, 11)}
              selected={selectedDate}
              month={month}
              onMonthChange={setMonth}
              formatters={{ formatMonthDropdown: (date) => format(date, "M月") }}
              onSelect={(date) => {
                if (date && withTime) {
                  date.setHours(selectedDate?.getHours() ?? 0, selectedDate?.getMinutes() ?? 0);
                }
                commit(date);
                setOpen(false);
              }}
              autoFocus
            />
          </React.Suspense>
          {withTime ? (
            <div className="border-t p-3">
              <Input
                type="time"
                aria-label="时间"
                value={selectedDate ? format(selectedDate, "HH:mm") : ""}
                disabled={!selectedDate}
                onChange={(event) => {
                  if (!selectedDate || !event.target.value) return;
                  const [hours, minutes] = event.target.value.split(":").map(Number);
                  const date = new Date(selectedDate);
                  date.setHours(hours ?? 0, minutes ?? 0);
                  commit(date);
                }}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function parseStrictDate(text: string, dateFormat: string): Date | undefined {
  const parsed = parse(text, dateFormat, new Date());
  return isValid(parsed) && format(parsed, dateFormat) === text ? parsed : undefined;
}
