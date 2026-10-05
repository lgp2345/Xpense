import { duplicateRentalItemNameIndexes, rentalDepositItemName } from "@xpense/shared";
import { useContext, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
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
  const duplicateErrors = Object.fromEntries(
    duplicateRentalItemNameIndexes(deposits.map(rentalDepositItemName)).map((index) => [
      `deposits.${index}.customName`,
      "押金事项名称不能重复",
    ]),
  );
  const errors = { ...useContext(ContractFieldErrorsContext), ...duplicateErrors };
  const hasName = (type: Deposit["type"]) =>
    deposits.some((item) => rentalDepositItemName(item) === rentalDepositItemName({ type }));
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
    <ContractFieldErrorsContext value={errors}>
      <FieldSet aria-labelledby="contract-deposits-title" className="min-w-0 gap-4 border-t pt-6">
        <div className="space-y-1">
          <h3 id="contract-deposits-title" className="text-base font-semibold">
            押金
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            按事项填写押金金额，自定义押金可编辑名称。
          </p>
        </div>
        <div className="space-y-4">
          {deposits.map((deposit, index) => (
            <div
              key={depositKey(index)}
              className="grid min-w-0 gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="space-y-2">
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
                    <ContractFieldMessage
                      name={`deposits.${index}.customName`}
                      focusOnError={!duplicateErrors[`deposits.${index}.customName`]}
                    />
                  </Field>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">押金名称 {index + 1}</p>
                    <span className="flex min-h-9 items-center text-sm">
                      {rentalDepositItemName(deposit)}
                    </span>
                    <ContractFieldMessage
                      name={`deposits.${index}.customName`}
                      focusOnError={!duplicateErrors[`deposits.${index}.customName`]}
                    />
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
                  onChange={(event) =>
                    updateDeposit(index, { fixedAmountText: event.target.value })
                  }
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={hasName("rental")}
              onClick={() => addDeposit("rental")}
            >
              租金
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={hasName("access_card")}
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
    </ContractFieldErrorsContext>
  );
}
