import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DISPLAY_FORMAT = "yyyy/MM/dd";
const SEARCH_FORMAT = "yyyy-MM-dd";
const DISPLAY_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2})$/;
const SEARCH_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DatePickerInputProps = {
  id?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  buttonLabel?: string;
};

export function DatePickerInput({
  id,
  value,
  onChange,
  placeholder = "2026/08/01",
  buttonLabel = "选择日期",
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(() => toDisplay(value));

  React.useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const selectedDate = React.useMemo(() => {
    return parseStrictDate(text, DISPLAY_PATTERN, DISPLAY_FORMAT);
  }, [text]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextText = event.currentTarget.value;
    setText(nextText);
    if (nextText === "") {
      onChange?.(undefined);
      return;
    }
    const parsed = parseStrictDate(nextText, DISPLAY_PATTERN, DISPLAY_FORMAT);
    if (parsed) {
      onChange?.(format(parsed, SEARCH_FORMAT));
    }
  }

  function handleInputBlur() {
    if (text !== "" && !parseStrictDate(text, DISPLAY_PATTERN, DISPLAY_FORMAT)) {
      setText(toDisplay(value));
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleSelect(date: Date | undefined) {
    setOpen(false);
    setText(date ? format(date, DISPLAY_FORMAT) : "");
    onChange?.(date ? format(date, SEARCH_FORMAT) : undefined);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Input
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className="pr-9"
        />
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={buttonLabel}
            className="absolute top-0 right-0 size-9 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          defaultMonth={selectedDate}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function toDisplay(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const parsed = parseStrictDate(value, SEARCH_PATTERN, SEARCH_FORMAT);
  return parsed ? format(parsed, DISPLAY_FORMAT) : "";
}

function parseStrictDate(text: string, pattern: RegExp, formatString: string): Date | undefined {
  const match = pattern.exec(text);
  if (!match) {
    return undefined;
  }
  const parsed = parse(text, formatString, new Date());
  if (!isValid(parsed)) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }
  return parsed;
}
