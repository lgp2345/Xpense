import type { RentalChargeTerms } from "@xpense/shared";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PeriodBillDraft } from "./period-bill-form";

/** 合同事项与临时事项在同一区域录入，修改只用于本张账单。 */
export function PeriodChargeFields({
  draft,
  terms,
  errors,
  onChange,
}: {
  draft: PeriodBillDraft;
  terms: RentalChargeTerms;
  errors: ReadonlyMap<string, string>;
  onChange: <K extends keyof PeriodBillDraft>(key: K, value: PeriodBillDraft[K]) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t pt-4">
      <legend className="px-0 text-sm font-medium">本期收费事项</legend>
      <p className="text-xs text-muted-foreground">合同事项已带出，修改金额仅用于本期。</p>
      {draft.overrideFixedFees.map((fee, index) => {
        const name = terms.fixedFees.find((item) => item.id === fee.id)?.name;
        const error = errors.get(`overrideFixedFees.${index}.amount`);
        const id = `period-fee-${fee.id}`;
        return (
          <div
            key={fee.id}
            className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_2.25rem] sm:items-start"
          >
            <div className="space-y-1 text-sm">
              <p className="text-xs text-muted-foreground">合同事项</p>
              <p className="flex min-h-9 items-center break-words font-medium">{name}</p>
            </div>
            <div className="space-y-1 text-sm">
              <label htmlFor={id}>金额（元/期）</label>
              <Input
                id={id}
                aria-label={`本期${name}金额（元）`}
                inputMode="decimal"
                value={fee.amount}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) =>
                  onChange(
                    "overrideFixedFees",
                    draft.overrideFixedFees.map((item) =>
                      item.id === fee.id ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }
              />
              {error ? (
                <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
      {draft.extraFees.map((fee, index) => (
        <div
          key={fee.id}
          className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_2.25rem] sm:items-start"
        >
          {(["name", "amount"] as const).map((field) => {
            const label =
              field === "name" ? `新增事项名称 ${index + 1}` : `新增事项金额（元） ${index + 1}`;
            const id = `period-extra-${fee.id}-${field}`;
            const error = errors.get(`extraFees.${index}.${field}`);
            return (
              <div key={field} className="space-y-1 text-sm">
                <label htmlFor={id}>{field === "name" ? "事项名称" : "金额（元）"}</label>
                <Input
                  id={id}
                  aria-label={label}
                  value={fee[field]}
                  inputMode={field === "amount" ? "decimal" : undefined}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) =>
                    onChange(
                      "extraFees",
                      draft.extraFees.map((item) =>
                        item.id === fee.id ? { ...item, [field]: event.target.value } : item,
                      ),
                    )
                  }
                />
                {error ? (
                  <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="justify-self-end sm:mt-6"
            aria-label={`移除收费事项 ${index + 1}`}
            onClick={() =>
              onChange(
                "extraFees",
                draft.extraFees.filter((item) => item.id !== fee.id),
              )
            }
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      {!draft.overrideFixedFees.length && !draft.extraFees.length ? (
        <p className="text-sm text-muted-foreground">合同暂无固定收费事项，可添加本期费用。</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange("extraFees", [
            ...draft.extraFees,
            { id: crypto.randomUUID(), name: "", amount: "", note: "" },
          ])
        }
      >
        <PlusIcon className="size-4" />
        添加收费事项
      </Button>
    </fieldset>
  );
}
