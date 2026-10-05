import { useContext } from "react";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContractFieldErrorsContext,
  ContractFieldMessage,
  contractFeedbackProps,
  useContractFieldFeedback,
} from "../contract-field-feedback";
import type { ContractFormValues } from "../contract-form-schema";

export function ContractPaymentFields({
  values,
  onChange,
}: {
  values: ContractFormValues;
  onChange: (values: ContractFormValues) => void;
}) {
  const errors = useContext(ContractFieldErrorsContext);
  const dueFeedback = useContractFieldFeedback("dueDaysBeforeText");
  const anchorFeedback = useContractFieldFeedback("billingAnchor");
  const intervalFeedback = useContractFieldFeedback("paymentIntervalMonths");
  const set = <K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) =>
    onChange({ ...values, [key]: value });
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">付款与提醒</h3>
      <FieldSet data-invalid={Boolean(errors.billingAnchor)} className="grid gap-2">
        <FieldLabel
          id="billing-anchor-label"
          data-invalid={Boolean(errors.billingAnchor)}
          className="font-medium text-sm data-[invalid=true]:text-destructive"
        >
          计费方式
        </FieldLabel>
        <RadioGroup
          {...anchorFeedback}
          aria-labelledby="billing-anchor-label"
          name="billing-anchor"
          value={values.billingAnchor}
          onValueChange={(billingAnchor) =>
            set("billingAnchor", billingAnchor as ContractFormValues["billingAnchor"])
          }
        >
          <FieldGroup className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              orientation="horizontal"
              className="rounded-md border bg-muted/20 px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem
                id="billing-contract-start"
                value="contract_start"
                aria-invalid={anchorFeedback["aria-invalid"]}
              />
              <FieldLabel htmlFor="billing-contract-start">合同起始日</FieldLabel>
            </Field>
            <Field
              orientation="horizontal"
              className="rounded-md border bg-muted/20 px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem
                id="billing-calendar-month"
                value="calendar_month"
                aria-invalid={anchorFeedback["aria-invalid"]}
              />
              <FieldLabel htmlFor="billing-calendar-month">自然月</FieldLabel>
            </Field>
          </FieldGroup>
        </RadioGroup>
        <ContractFieldMessage name="billingAnchor" />
      </FieldSet>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          data-invalid={contractFeedbackProps(errors, "paymentIntervalMonths")["aria-invalid"]}
        >
          <FieldLabel htmlFor="contract-payment-interval">付款周期</FieldLabel>
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
            <SelectTrigger
              id="contract-payment-interval"
              {...intervalFeedback}
              aria-label="付款周期"
              className="w-full"
            >
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
          <ContractFieldMessage name="paymentIntervalMonths" />
        </Field>
        <Field data-invalid={contractFeedbackProps(errors, "dueDaysBeforeText")["aria-invalid"]}>
          <FieldLabel htmlFor="contract-due-days">到期提醒提前天数</FieldLabel>
          <Input
            id="contract-due-days"
            {...dueFeedback}
            inputMode="numeric"
            value={values.dueDaysBeforeText}
            onChange={(event) => set("dueDaysBeforeText", event.target.value)}
          />

          <ContractFieldMessage name="dueDaysBeforeText" />
        </Field>
      </div>
    </div>
  );
}
