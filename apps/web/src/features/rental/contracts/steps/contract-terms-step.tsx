import { useRef } from "react";
import { DateRangePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ContractFormValues, isValidDate } from "../contract-form-schema";

export function ContractTermsStep({
  values,
  onChange,
}: {
  values: ContractFormValues;
  onChange: (values: ContractFormValues) => void;
}) {
  const depositKeys = useRef<string[]>([]);
  const depositSequence = useRef(0);
  const depositKey = (index: number) => {
    depositKeys.current[index] ??= `deposit-${depositSequence.current++}`;
    return depositKeys.current[index] as string;
  };
  const set = <K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) =>
    onChange({ ...values, [key]: value });
  function updateDeposit(index: number, patch: Partial<ContractFormValues["deposits"][number]>) {
    set(
      "deposits",
      values.deposits.map((item, current) => (current === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <section aria-labelledby="contract-terms-title" className="space-y-4">
      <h2 id="contract-terms-title" className="text-lg font-medium">
        设置合同条款
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm" htmlFor="contract-external-number">
          合同编号
          <Input
            id="contract-external-number"
            value={values.externalContractNumber}
            onChange={(event) => set("externalContractNumber", event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm" htmlFor="contract-rent-amount">
          月租（元）
          <Input
            id="contract-rent-amount"
            inputMode="decimal"
            value={values.rentAmountText}
            onChange={(event) => set("rentAmountText", event.target.value)}
          />
        </label>
        <div className="grid gap-2 text-sm sm:col-span-2">
          <label htmlFor="contract-date-range">租期范围</label>
          <div className="flex gap-2">
            <DateRangePicker
              id="contract-date-range"
              aria-label="租期范围"
              value={{ from: values.startDate, to: values.endDate }}
              onChange={({ from, to }) =>
                onChange({ ...values, startDate: from ?? "", endDate: to ?? "" })
              }
              className="min-w-0 flex-1"
            />
            {values.startDate || values.endDate ? (
              <Button
                type="button"
                variant="outline"
                aria-label="清除租期"
                onClick={() => onChange({ ...values, startDate: "", endDate: "" })}
              >
                清除
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">计费方式</legend>
        <label className="flex items-center gap-2 text-sm" htmlFor="billing-contract-start">
          <input
            id="billing-contract-start"
            type="radio"
            name="billing-anchor"
            checked={values.billingAnchor === "contract_start"}
            onChange={() => set("billingAnchor", "contract_start")}
          />
          合同起始日
        </label>
        <label className="flex items-center gap-2 text-sm" htmlFor="billing-calendar-month">
          <input
            id="billing-calendar-month"
            type="radio"
            name="billing-anchor"
            checked={values.billingAnchor === "calendar_month"}
            onChange={() => set("billingAnchor", "calendar_month")}
          />
          自然月
        </label>
      </fieldset>
      <div className="grid gap-2 text-sm">
        <label htmlFor="contract-payment-interval">付款周期</label>
        <Select
          value={values.paymentIntervalMonths || "none"}
          onValueChange={(paymentIntervalMonths) =>
            set(
              "paymentIntervalMonths",
              (paymentIntervalMonths === "none"
                ? ""
                : paymentIntervalMonths) as ContractFormValues["paymentIntervalMonths"],
            )
          }
        >
          <SelectTrigger id="contract-payment-interval" aria-label="付款周期" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">请选择</SelectItem>
            <SelectItem value="1">每月</SelectItem>
            <SelectItem value="3">每季</SelectItem>
            <SelectItem value="6">每半年</SelectItem>
            <SelectItem value="12">每年</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="grid gap-2 text-sm" htmlFor="contract-due-days">
        到期提醒提前天数
        <Input
          id="contract-due-days"
          inputMode="numeric"
          value={values.dueDaysBeforeText}
          onChange={(event) => set("dueDaysBeforeText", event.target.value)}
        />
      </label>
      <label className="grid gap-2 text-sm" htmlFor="contract-note">
        备注
        <textarea
          id="contract-note"
          className="min-h-24 rounded-md border bg-background p-2"
          value={values.note}
          onChange={(event) => set("note", event.target.value)}
        />
      </label>
      <fieldset className="rounded-md border p-3">
        <legend className="text-sm font-medium">押金</legend>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            (() => {
              depositKeys.current.push(`deposit-${depositSequence.current++}`);
              set("deposits", [
                ...values.deposits,
                {
                  type: "rental",
                  customName: "",
                  calculationMode: "fixed_amount",
                  fixedAmountText: "",
                  rentMultipleText: "",
                },
              ]);
            })()
          }
        >
          添加押金
        </Button>
        {values.deposits.map((deposit, index) => (
          <div key={depositKey(index)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1 text-sm">
              <label htmlFor={`deposit-type-${index}`}>类型</label>
              <Select
                value={deposit.type}
                onValueChange={(type) =>
                  updateDeposit(index, {
                    type: type as typeof deposit.type,
                    customName: type === "other" ? deposit.customName : "",
                  })
                }
              >
                <SelectTrigger
                  id={`deposit-type-${index}`}
                  aria-label={`押金类型 ${index + 1}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rental">租金</SelectItem>
                  <SelectItem value="utility">水电</SelectItem>
                  <SelectItem value="access_card">门禁卡</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {deposit.type === "other" ? (
              <label className="grid gap-1 text-sm" htmlFor={`deposit-name-${index}`}>
                押金名称
                <Input
                  id={`deposit-name-${index}`}
                  value={deposit.customName}
                  onChange={(event) => updateDeposit(index, { customName: event.target.value })}
                />
              </label>
            ) : null}
            <fieldset className="grid gap-1">
              <legend className="text-sm">计算方式</legend>
              <label className="flex items-center gap-2 text-sm" htmlFor={`deposit-fixed-${index}`}>
                <input
                  id={`deposit-fixed-${index}`}
                  type="radio"
                  name={`deposit-mode-${index}`}
                  checked={deposit.calculationMode === "fixed_amount"}
                  onChange={() =>
                    updateDeposit(index, { calculationMode: "fixed_amount", rentMultipleText: "" })
                  }
                />
                固定金额
              </label>
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor={`deposit-multiple-${index}`}
              >
                <input
                  id={`deposit-multiple-${index}`}
                  type="radio"
                  name={`deposit-mode-${index}`}
                  checked={deposit.calculationMode === "rent_multiple"}
                  onChange={() =>
                    updateDeposit(index, { calculationMode: "rent_multiple", fixedAmountText: "" })
                  }
                />
                租金倍数
              </label>
            </fieldset>
            {deposit.calculationMode === "fixed_amount" ? (
              <label className="grid gap-1 text-sm" htmlFor={`deposit-fixed-value-${index}`}>
                固定金额
                <Input
                  id={`deposit-fixed-value-${index}`}
                  inputMode="decimal"
                  value={deposit.fixedAmountText}
                  onChange={(event) =>
                    updateDeposit(index, { fixedAmountText: event.target.value })
                  }
                />
              </label>
            ) : (
              <label className="grid gap-1 text-sm" htmlFor={`deposit-multiple-value-${index}`}>
                租金倍数
                <Input
                  id={`deposit-multiple-value-${index}`}
                  inputMode="decimal"
                  value={deposit.rentMultipleText}
                  onChange={(event) =>
                    updateDeposit(index, { rentMultipleText: event.target.value })
                  }
                />
              </label>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                (() => {
                  depositKeys.current.splice(index, 1);
                  set(
                    "deposits",
                    values.deposits.filter((_, current) => current !== index),
                  );
                })()
              }
            >
              移除
            </Button>
          </div>
        ))}
      </fieldset>
      {values.startDate && values.endDate && values.billingAnchor ? (
        <div className="rounded-md border p-3 text-sm" aria-live="polite">
          <p className="font-medium">账期预览</p>
          {calendarPreview(
            values.startDate,
            values.endDate,
            values.billingAnchor,
            Number(values.paymentIntervalMonths) || 1,
          ).map((period) => (
            <p key={period}>{period}</p>
          ))}
          <p className="text-muted-foreground">预览，最终由服务端计算</p>
        </div>
      ) : null}
    </section>
  );
}

export function calendarPreview(
  start: string,
  end: string,
  anchor: "contract_start" | "calendar_month",
  interval: number,
): string[] {
  if (
    !isValidDate(start, end) ||
    !Number.isFinite(interval) ||
    !Number.isInteger(interval) ||
    interval <= 0
  )
    return [];
  if (anchor === "contract_start") return [`${start} 起，按 ${interval} 个月一期`];
  const result: string[] = [];
  let cursor = start;
  const maxPeriods = 1200;
  while (cursor <= end && result.length < maxPeriods) {
    const periodEnd = endOfMonth(addMonths(firstOfMonth(cursor), interval - 1));
    const boundedEnd = periodEnd < end ? periodEnd : end;
    result.push(`${cursor} 至 ${boundedEnd}`);
    if (boundedEnd === end) break;
    cursor = firstOfNextMonth(boundedEnd);
  }
  return result;
}
function endOfMonth(value: string): string {
  const [rawYear, rawMonth] = value.split("-").map(Number);
  const year = rawYear ?? 0;
  const month = rawMonth ?? 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}
function firstOfNextMonth(value: string): string {
  const [rawYear, rawMonth] = value.split("-").map(Number);
  const year = rawYear ?? 0;
  const month = rawMonth ?? 1;
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  return `${next[0]}-${String(next[1]).padStart(2, "0")}-01`;
}
function firstOfMonth(value: string): string {
  const [rawYear, rawMonth] = value.split("-").map(Number);
  const year = rawYear ?? 0;
  const month = rawMonth ?? 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
function addMonths(value: string, count: number): string {
  const [rawYear, rawMonth, rawDay] = value.split("-").map(Number);
  const year = rawYear ?? 0;
  const month = rawMonth ?? 1;
  const day = rawDay ?? 1;
  const date = new Date(Date.UTC(year, month - 1 + count, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
