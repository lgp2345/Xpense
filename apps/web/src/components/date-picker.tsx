import { addMonths, format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const Calendar = React.lazy(() =>
  import("@/components/ui/calendar").then((module) => ({ default: module.Calendar })),
);

const durationPresets = [
  { label: "一个月", months: 1 },
  { label: "三个月", months: 3 },
  { label: "半年", months: 6 },
  { label: "一年", months: 12 },
  { label: "两年", months: 24 },
  { label: "三年", months: 36 },
];

type DatePickerInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value?: string;
  onChange?: (value: string | undefined) => void;
  buttonLabel?: string;
  withTime?: boolean;
};

export type DateRangeValue = {
  from?: string;
  to?: string;
};

type DateRangePickerProps = Pick<
  React.ComponentProps<typeof Button>,
  "aria-invalid" | "aria-describedby" | "aria-required"
> & {
  id?: string;
  "aria-label": string;
  value?: DateRangeValue;
  onChange?: (value: DateRangeValue) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showDurationPresets?: boolean;
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

// Adapted from Shadcn Studio date-picker-13 (range selection).
// https://github.com/shadcnstudio/shadcn-studio/tree/main/src/components/shadcn-studio/date-picker
export function DateRangePicker({
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  value,
  onChange,
  placeholder = "选择日期范围",
  disabled,
  className,
  showDurationPresets = false,
}: DateRangePickerProps) {
  const from = parseStrictDate(value?.from ?? "", "yyyy-MM-dd");
  const to = parseStrictDate(value?.to ?? "", "yyyy-MM-dd");
  const selected: DateRange | undefined = from || to ? { from, to } : undefined;
  const [month, setMonth] = React.useState<Date | undefined>(from ?? to);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setMonth(from ?? to ?? new Date());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired}
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !from && !to && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon />
          <span className="truncate">{formatRange(from, to, placeholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <React.Suspense
          fallback={<p className="p-3 text-sm text-muted-foreground">正在加载日历…</p>}
        >
          <Calendar
            mode="range"
            locale={zhCN}
            captionLayout="dropdown"
            startMonth={new Date(1900, 0)}
            endMonth={new Date(2100, 11)}
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(range) =>
              onChange?.({
                from: range?.from ? format(range.from, "yyyy-MM-dd") : undefined,
                to: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
              })
            }
            formatters={{ formatMonthDropdown: (date) => format(date, "M月") }}
            fixedWeeks
            autoFocus
          />
        </React.Suspense>
        {showDurationPresets ? (
          <fieldset aria-label="快捷选择日期范围" className="grid grid-cols-3 gap-2 border-t p-3">
            {durationPresets.map(({ label, months }) => (
              <Button
                key={months}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date();
                  onChange?.({
                    from: format(today, "yyyy-MM-dd"),
                    to: format(addMonths(today, months), "yyyy-MM-dd"),
                  });
                  setMonth(today);
                }}
              >
                {label}
              </Button>
            ))}
          </fieldset>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function formatRange(from: Date | undefined, to: Date | undefined, placeholder: string): string {
  if (from && to) return `${format(from, "yyyy/MM/dd")} - ${format(to, "yyyy/MM/dd")}`;
  if (from) return `${format(from, "yyyy/MM/dd")} -`;
  if (to) return `- ${format(to, "yyyy/MM/dd")}`;
  return placeholder;
}

function parseStrictDate(text: string, dateFormat: string): Date | undefined {
  const parsed = parse(text, dateFormat, new Date());
  return isValid(parsed) && format(parsed, dateFormat) === text ? parsed : undefined;
}
