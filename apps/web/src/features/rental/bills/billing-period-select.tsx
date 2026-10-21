import type { RentalBillingPeriod } from "@xpense/shared";
import { type KeyboardEvent, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const batchSize = 20;

type Props = {
  periods: RentalBillingPeriod[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

/** 长合同按滚动进度分批展示账期，选中项始终可见，键盘可访问完整列表。 */
export function BillingPeriodSelect({ periods, value, disabled, onChange }: Props) {
  const [loadedCount, setLoadedCount] = useState(batchSize);
  const items = useMemo(
    () =>
      periods.map((period) => ({
        value: period.periodStart,
        label: `${period.periodStart} 至 ${period.periodEnd}`,
      })),
    [periods],
  );
  const selectedIndex = periods.findIndex((period) => period.periodStart === value);
  const visibleCount = Math.max(
    loadedCount,
    Math.ceil((selectedIndex + 1) / batchSize) * batchSize,
  );
  const hasMore = visibleCount < items.length;
  const revealForKeyboard = (event: KeyboardEvent) => {
    if (
      hasMore &&
      (event.key.length === 1 || ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
    ) {
      // Base UI 在本次按键冒泡时读取选项，须先同步挂载以保留 End、方向键和文本定位。
      flushSync(() => setLoadedCount(items.length));
    }
  };

  return (
    <Select value={value} disabled={disabled} items={items} onValueChange={onChange}>
      <SelectTrigger
        id="period-start"
        aria-label="出账账期"
        className="w-full min-w-0"
        onKeyDownCapture={revealForKeyboard}
      >
        <SelectValue placeholder="请选择出账账期" />
      </SelectTrigger>
      <SelectContent
        listProps={{
          className: "max-h-[min(18rem,var(--available-height))] overscroll-contain",
          onKeyDownCapture: revealForKeyboard,
          onScroll: (event) => {
            const list = event.currentTarget;
            if (hasMore && list.scrollHeight - list.scrollTop - list.clientHeight <= 48) {
              setLoadedCount(Math.min(visibleCount + batchSize, items.length));
            }
          },
        }}
      >
        {items.slice(0, visibleCount).map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
