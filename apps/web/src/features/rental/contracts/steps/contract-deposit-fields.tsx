import { useContext, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ContractFieldErrorsContext,
  ContractFieldMessage,
  contractFeedbackProps,
} from "../contract-field-feedback";
import type { ContractFormValues } from "../contract-form-schema";

type Deposit = ContractFormValues["deposits"][number];

export function ContractDepositFields({
  deposits,
  onChange,
}: {
  deposits: Deposit[];
  onChange: (deposits: Deposit[]) => void;
}) {
  const errors = useContext(ContractFieldErrorsContext);
  const depositKeys = useRef<string[]>([]);
  const depositSequence = useRef(0);
  const depositKey = (index: number) => {
    depositKeys.current[index] ??= `deposit-${depositSequence.current++}`;
    return depositKeys.current[index] as string;
  };
  const updateDeposit = (index: number, patch: Partial<Deposit>) =>
    onChange(deposits.map((item, current) => (current === index ? { ...item, ...patch } : item)));
  const addDeposit = (type: Deposit["type"]) => {
    depositKeys.current.push(`deposit-${depositSequence.current++}`);
    onChange([
      ...deposits,
      {
        type,
        customName: "",
        calculationMode: "fixed_amount",
        fixedAmountText: "",
      },
    ]);
  };

  return (
    <FieldSet className="border rounded-md p-3">
      <FieldLegend className="font-medium text-sm">押金</FieldLegend>
      <div className="space-y-3">
        {deposits.map((deposit, index) => (
          <div
            key={depositKey(index)}
            className="grid min-w-0 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div className="space-y-1">
              {deposit.type === "other" ? (
                <Field
                  data-invalid={
                    contractFeedbackProps(errors, `deposits.${index}.customName`)["aria-invalid"]
                  }
                >
                  <FieldLabel htmlFor={`deposit-name-${index}`}>押金名称 {index + 1}</FieldLabel>
                  <Input
                    id={`deposit-name-${index}`}
                    {...contractFeedbackProps(errors, `deposits.${index}.customName`)}
                    value={deposit.customName}
                    onChange={(event) => updateDeposit(index, { customName: event.target.value })}
                  />
                  <ContractFieldMessage name={`deposits.${index}.customName`} />
                </Field>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium">押金名称 {index + 1}</p>
                  <span className="flex min-h-9 items-center text-sm">
                    {deposit.type === "rental"
                      ? "租金"
                      : deposit.type === "access_card"
                        ? "门禁卡"
                        : "水电"}
                  </span>
                </div>
              )}
            </div>
            <Field
              data-invalid={
                contractFeedbackProps(errors, `deposits.${index}.fixedAmountText`)["aria-invalid"]
              }
            >
              <FieldLabel htmlFor={`deposit-amount-${index}`}>押金金额 {index + 1}</FieldLabel>
              <Input
                id={`deposit-amount-${index}`}
                {...contractFeedbackProps(errors, `deposits.${index}.fixedAmountText`)}
                inputMode="decimal"
                className="text-base tabular-nums md:text-sm"
                value={deposit.fixedAmountText}
                onChange={(event) => updateDeposit(index, { fixedAmountText: event.target.value })}
              />
              <ContractFieldMessage name={`deposits.${index}.fixedAmountText`} />
            </Field>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              aria-label={`移除押金 ${index + 1}`}
              onClick={() => {
                depositKeys.current.splice(index, 1);
                onChange(deposits.filter((_, current) => current !== index));
              }}
            >
              移除
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addDeposit("rental")}>
            租金
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addDeposit("access_card")}
          >
            门禁卡
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addDeposit("other")}>
            添加自定义押金项
          </Button>
        </div>
      </div>
    </FieldSet>
  );
}
