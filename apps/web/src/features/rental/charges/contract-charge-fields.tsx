import { duplicateRentalItemNameIndexes } from "@xpense/shared";
import { useId, useState } from "react";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContractChargeFormValues } from "./contract-charge-form";

const presetFeeNames = ["管理费", "网费", "清洁费"];

/** 创建与详情共用的收费字段；所有请求由外层表单负责。 */
export function ContractChargeFields({
  value,
  onChange,
  disabled = false,
  errors = {},
  showBaselines = true,
  confirmRemoval = false,
}: {
  value: ContractChargeFormValues;
  onChange: (value: ContractChargeFormValues) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
  showBaselines?: boolean;
  confirmRemoval?: boolean;
}) {
  const prefix = useId();
  const [removing, setRemoving] = useState<string | null>(null);
  const duplicateErrors = Object.fromEntries(
    duplicateRentalItemNameIndexes(value.fixedFees.map(({ name }) => name)).map((index) => [
      `fixedFees.${index}.name`,
      "固定收费事项名称不能重复",
    ]),
  );
  const error = (name: string) =>
    duplicateErrors[name] ?? errors[name] ?? errors[`chargeSetup.${name}`];
  const feedback = (name: string) => ({
    "aria-invalid": Boolean(error(name)),
    "aria-describedby": error(name) ? `${prefix}-${name}-error` : undefined,
  });
  const message = (name: string) =>
    error(name) ? (
      <p id={`${prefix}-${name}-error`} role="alert" className="text-xs text-destructive">
        {error(name)}
      </p>
    ) : null;
  const change = <K extends keyof ContractChargeFormValues>(
    name: K,
    next: ContractChargeFormValues[K],
  ) => onChange({ ...value, [name]: next });
  const remove = (id: string) => {
    change(
      "fixedFees",
      value.fixedFees.filter((fee) => fee.id !== id),
    );
    setRemoving(null);
  };
  return (
    <fieldset
      disabled={disabled}
      aria-labelledby={`${prefix}-title`}
      className="min-w-0 space-y-5 border-t pt-6"
    >
      <div className="space-y-1">
        <h3 id={`${prefix}-title`} className="text-base font-semibold">
          月度收费事项
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">统一设置水电代收与固定月费。</p>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium">水电代收</h4>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {(["water", "electricity"] as const).map((kind) => {
            const label = kind === "water" ? "水" : "电";
            const enabled = value[`${kind}CollectionEnabled`];
            const priceKey = `${kind}UnitPrice` as const;
            const readingKey = `${kind}Reading` as const;
            const dateKey = `${kind}ReadingDate` as const;
            return (
              <div key={kind} className="min-w-0 space-y-4 rounded-md border p-4">
                <div className="flex items-center gap-2 border-b pb-3">
                  <Checkbox
                    id={`${prefix}-${kind}`}
                    checked={enabled}
                    onCheckedChange={(checked) =>
                      change(`${kind}CollectionEnabled`, checked === true)
                    }
                  />
                  <Label htmlFor={`${prefix}-${kind}`}>房东代收{label}费</Label>
                </div>
                {enabled ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`${prefix}-${priceKey}`}>{label}费单价（元）</Label>
                      <Input
                        id={`${prefix}-${priceKey}`}
                        {...feedback(priceKey)}
                        inputMode="decimal"
                        className="text-base tabular-nums md:text-sm"
                        value={value[priceKey]}
                        onChange={(event) => change(priceKey, event.target.value)}
                      />
                      {message(priceKey)}
                    </div>
                    {showBaselines ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={`${prefix}-${readingKey}`}>{label}表入住底数</Label>
                          <Input
                            id={`${prefix}-${readingKey}`}
                            {...feedback(readingKey)}
                            inputMode="decimal"
                            className="text-base tabular-nums md:text-sm"
                            value={value[readingKey]}
                            onChange={(event) => change(readingKey, event.target.value)}
                          />
                          {message(readingKey)}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${prefix}-${dateKey}`}>{label}表抄表日期</Label>
                          <DatePickerInput
                            id={`${prefix}-${dateKey}`}
                            {...feedback(dateKey)}
                            value={value[dateKey]}
                            onChange={(next) => change(dateKey, next ?? "")}
                          />
                          {message(dateKey)}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">不代收，不计入新账单</p>
                )}
              </div>
            );
          })}
        </div>
        {showBaselines ? (
          <p className="text-xs leading-5 text-muted-foreground">
            可交房时补录；代收项目补齐后才能生成月度账单
          </p>
        ) : null}
      </div>
      <div className="space-y-4 border-t pt-4">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">固定月费</h4>
          <p className="text-xs leading-5 text-muted-foreground">
            按月收取，不足月按整月计费。默认事项名称不可修改。
          </p>
        </div>
        {value.fixedFees.map((fee, index) => (
          <div
            key={fee.id}
            className="grid min-w-0 gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-${fee.id}-name`}>事项名称 {index + 1}</Label>
              <Input
                id={`${prefix}-${fee.id}-name`}
                {...feedback(`fixedFees.${index}.name`)}
                value={fee.name}
                readOnly={fee.nameLocked ?? presetFeeNames.includes(fee.name)}
                className="read-only:border-transparent read-only:bg-transparent read-only:shadow-none dark:read-only:bg-transparent"
                onChange={
                  (fee.nameLocked ?? presetFeeNames.includes(fee.name))
                    ? undefined
                    : (event) =>
                        change(
                          "fixedFees",
                          value.fixedFees.map((item) =>
                            item.id === fee.id ? { ...item, name: event.target.value } : item,
                          ),
                        )
                }
              />
              {message(`fixedFees.${index}.name`)}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-${fee.id}-amount`}>月费金额 {index + 1}</Label>
              <Input
                id={`${prefix}-${fee.id}-amount`}
                {...feedback(`fixedFees.${index}.amount`)}
                inputMode="decimal"
                className="text-base tabular-nums md:text-sm"
                value={fee.amount}
                onChange={(event) =>
                  change(
                    "fixedFees",
                    value.fixedFees.map((item) =>
                      item.id === fee.id ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }
              />
              {message(`fixedFees.${index}.amount`)}
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              aria-label={`移除事项 ${index + 1}`}
              onClick={() => (confirmRemoval ? setRemoving(fee.id) : remove(fee.id))}
            >
              移除
            </Button>
            {removing === fee.id ? (
              <div className="space-y-2 sm:col-span-3" role="alert">
                <p className="text-sm">确认移除“{fee.name}”？仅影响之后生成的账单。</p>
                <Button type="button" variant="destructive" onClick={() => remove(fee.id)}>
                  确认移除
                </Button>
                <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
                  取消
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {message("fixedFees")}
        <div className="flex flex-wrap gap-2">
          {[...presetFeeNames, "添加其他事项"].map((name) => (
            <Button
              key={name}
              type="button"
              variant="outline"
              size="sm"
              disabled={
                name !== "添加其他事项" && value.fixedFees.some((fee) => fee.name.trim() === name)
              }
              onClick={() =>
                change("fixedFees", [
                  ...value.fixedFees,
                  {
                    id: crypto.randomUUID(),
                    name: name === "添加其他事项" ? "" : name,
                    amount: "",
                    nameLocked: name !== "添加其他事项",
                  },
                ])
              }
            >
              {name}
            </Button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/** 复核页展示与输入共用同一数据，不计算正式应收金额。 */
export function ContractChargeSummary({ value }: { value: ContractChargeFormValues | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1 text-sm break-words">
      <p className="font-medium">月度收费事项</p>
      {(["water", "electricity"] as const).map((kind) => (
        <p key={kind}>
          {kind === "water" ? "水费" : "电费"}：
          {value[`${kind}CollectionEnabled`]
            ? `${value[`${kind}UnitPrice`]} 元 · ${value[`${kind}Reading`] ? `入住底数 ${value[`${kind}Reading`]}（${value[`${kind}ReadingDate`]}）` : "底数待补"}`
            : "不代收"}
        </p>
      ))}
      {value.fixedFees.map((fee) => (
        <p key={fee.id} className="tabular-nums">
          {fee.name}：{fee.amount} 元/月
        </p>
      ))}
    </div>
  );
}
