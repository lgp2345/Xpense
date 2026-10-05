import { addMonths, endOfDay, format, isValid, parse, startOfDay, subDays } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { Calendar as CalendarIcon, ClockIcon } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
const dateFormat = "yyyy-MM-dd";
const dateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss";

export type DateRangeValue = {
  /** 日期模式为 YYYY-MM-DD；时间模式为本地 YYYY-MM-DDTHH:mm:ss。 */
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
  /** 启用时分秒选择，未指定时间时使用当天的起止时间。 */
  withTime?: boolean;
};

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
  withTime = false,
}: DateRangePickerProps) {
  const from = parseBound(value?.from, withTime, false);
  const to = parseBound(value?.to, withTime, true);
  const selected: DateRange | undefined = from || to ? { from, to } : undefined;
  const [month, setMonth] = React.useState<Date | undefined>(from ?? to);
  const [invalidRange, setInvalidRange] = React.useState<DateRangeValue>();
  const timeId = React.useId();
  const hasTimeError = Boolean(
    invalidRange && invalidRange.from === value?.from && invalidRange.to === value?.to,
  );
  const valueFormat = withTime ? dateTimeFormat : dateFormat;
  const displayFormat = withTime ? "yyyy/MM/dd HH:mm:ss" : "yyyy/MM/dd";

  function commit(start: Date | undefined, end: Date | undefined) {
    if (withTime && start && end && start > end) {
      setInvalidRange({ from: value?.from, to: value?.to });
      return;
    }
    setInvalidRange(undefined);
    onChange?.({
      from: start ? format(start, valueFormat) : undefined,
      to: end ? format(end, valueFormat) : undefined,
    });
  }

  function changeTime(bound: "from" | "to", time: string) {
    const current = bound === "from" ? from : to;
    const parsedTime = parseStrictDate(time, "HH:mm:ss") ?? parseStrictDate(time, "HH:mm");
    if (!current || !parsedTime) return;
    const next = new Date(current);
    next.setHours(parsedTime.getHours(), parsedTime.getMinutes(), parsedTime.getSeconds(), 0);
    commit(bound === "from" ? next : from, bound === "to" ? next : to);
  }

  return (
    <Popover
      onOpenChange={(open) => {
        setInvalidRange(undefined);
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
            withTime && "h-auto min-h-9 py-2",
            className,
          )}
        >
          <CalendarIcon />
          {from || to ? (
            <span className={cn("min-w-0", withTime ? "flex flex-wrap gap-x-1" : "truncate")}>
              {from ? <span>{format(from, displayFormat)}</span> : null}
              <span>{" - "}</span>
              {to ? <span>{format(to, displayFormat)}</span> : null}
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0",
          withTime &&
            "grid w-80 max-w-(--radix-popover-content-available-width) sm:w-auto sm:grid-cols-[auto_11.5rem] sm:grid-rows-[auto_1fr]",
        )}
        align="start"
        collisionPadding={8}
      >
        <div
          className={cn(
            withTime && "flex justify-center sm:col-start-1 sm:row-span-2 sm:row-start-1",
          )}
        >
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
                commit(
                  withTime ? applyTime(range?.from, from, false) : range?.from,
                  withTime ? applyTime(range?.to, to, true) : range?.to,
                )
              }
              formatters={{ formatMonthDropdown: (date) => format(date, "M月") }}
              fixedWeeks
              autoFocus
            />
          </React.Suspense>
        </div>
        {withTime ? (
          <fieldset
            aria-label="选择起止时间"
            className={cn(
              "grid grid-cols-2 content-start gap-3 border-t p-3 sm:col-start-2 sm:row-start-1 sm:grid-cols-1 sm:border-t-0 sm:border-l sm:bg-muted/20",
              !showDurationPresets && "sm:row-span-2",
            )}
          >
            {(
              [
                { bound: "from", label: "开始时间", date: from, defaultTime: "00:00:00" },
                { bound: "to", label: "结束时间", date: to, defaultTime: "23:59:59" },
              ] as const
            ).map(({ bound, label, date, defaultTime }) => (
              <div key={bound} className="grid min-w-0 gap-1.5">
                <Label htmlFor={`${timeId}-${bound}`} className="text-xs">
                  {label}
                </Label>
                <div className="relative min-w-0">
                  <Input
                    id={`${timeId}-${bound}`}
                    type="time"
                    step="1"
                    aria-invalid={hasTimeError || undefined}
                    aria-describedby={hasTimeError ? `${timeId}-error` : undefined}
                    value={date ? format(date, "HH:mm:ss") : defaultTime}
                    disabled={!date || disabled}
                    onChange={(event) => changeTime(bound, event.target.value)}
                    className="peer appearance-none px-2 tabular-nums sm:pl-8 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-0 hidden items-center pl-2.5 text-muted-foreground/80 peer-disabled:opacity-50 sm:flex">
                    <ClockIcon size={14} aria-hidden="true" />
                  </div>
                </div>
              </div>
            ))}
            {hasTimeError ? (
              <p
                id={`${timeId}-error`}
                role="alert"
                className="col-span-full text-xs text-destructive"
              >
                结束时间不能早于开始时间
              </p>
            ) : null}
          </fieldset>
        ) : null}
        {showDurationPresets ? (
          <fieldset
            aria-label="快捷选择日期范围"
            className={cn(
              "grid grid-cols-3 content-start gap-2 border-t p-3",
              withTime && "sm:col-start-2 sm:row-start-2 sm:grid-cols-2 sm:border-l sm:bg-muted/20",
            )}
          >
            {durationPresets.map(({ label, months }) => (
              <Button
                key={months}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  const today = startOfDay(new Date());
                  const end = subDays(addMonths(today, months), 1);
                  commit(today, withTime ? endOfDay(end) : end);
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

function parseStrictDate(text: string, pattern: string): Date | undefined {
  const parsed = parse(text, pattern, new Date());
  return isValid(parsed) && format(parsed, pattern) === text ? parsed : undefined;
}

function parseBound(
  value: string | undefined,
  withTime: boolean,
  isEnd: boolean,
): Date | undefined {
  if (withTime) {
    const dateTime = parseStrictDate(value ?? "", dateTimeFormat);
    if (dateTime) return dateTime;
  }
  const date = parseStrictDate(value ?? "", dateFormat);
  return withTime ? applyTime(date, undefined, isEnd) : date;
}

function applyTime(
  date: Date | undefined,
  previous: Date | undefined,
  isEnd: boolean,
): Date | undefined {
  if (!date) return undefined;
  const result = new Date(date);
  result.setHours(
    previous?.getHours() ?? (isEnd ? 23 : 0),
    previous?.getMinutes() ?? (isEnd ? 59 : 0),
    previous?.getSeconds() ?? (isEnd ? 59 : 0),
    0,
  );
  return result;
}
