import { useContext } from 'react'
import { DateRangePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContractChargeFields } from '../../charges/contract-charge-fields'
import {
  ContractFieldErrorsContext,
  ContractFieldMessage,
  contractFeedbackProps,
  useContractFieldFeedback,
} from '../contract-field-feedback'
import { type ContractFormValues, isValidDate } from '../contract-form-schema'
import { BillingPeriodPreview } from './billing-period-preview'
import { ContractDepositFields } from './contract-deposit-fields'

export function ContractTermsStep({
  values,
  onChange,
  canEditMeters = true,
}: {
  values: ContractFormValues
  canEditMeters?: boolean
  onChange: (values: ContractFormValues) => void
}) {
  const errors = useContext(ContractFieldErrorsContext)
  const rentFeedback = useContractFieldFeedback('rentAmountText', 'spaces')
  const dateFeedback = useContractFieldFeedback('startDate', 'endDate')
  const dueFeedback = useContractFieldFeedback('dueDaysBeforeText')
  const anchorFeedback = useContractFieldFeedback('billingAnchor')
  const intervalFeedback = useContractFieldFeedback('paymentIntervalMonths')
  const set = <K extends keyof ContractFormValues>(
    key: K,
    value: ContractFormValues[K],
  ) => onChange({ ...values, [key]: value })
  return (
    <section aria-labelledby="contract-terms-title" className="space-y-4">
      <h2 id="contract-terms-title" className="font-medium text-lg">
        设置合同条款
      </h2>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field
          data-invalid={
            contractFeedbackProps(errors, 'externalContractNumber')[
              'aria-invalid'
            ]
          }
        >
          <FieldLabel htmlFor="contract-external-number">合同编号</FieldLabel>
          <Input
            id="contract-external-number"
            {...contractFeedbackProps(errors, 'externalContractNumber')}
            value={values.externalContractNumber}
            onChange={(event) =>
              set('externalContractNumber', event.target.value)
            }
          />

          <ContractFieldMessage name="externalContractNumber" />
        </Field>
        <Field
          data-invalid={
            contractFeedbackProps(errors, 'rentAmountText', 'spaces')[
              'aria-invalid'
            ]
          }
        >
          <FieldLabel htmlFor="contract-rent-amount">月租（元）</FieldLabel>
          <Input
            id="contract-rent-amount"
            {...rentFeedback}
            inputMode="decimal"
            value={values.rentAmountText}
            onChange={(event) => set('rentAmountText', event.target.value)}
          />

          <ContractFieldMessage name="rentAmountText" alternateName="spaces" />
        </Field>
        <Field
          data-invalid={
            contractFeedbackProps(errors, 'startDate', 'endDate')[
              'aria-invalid'
            ]
          }
          className="sm:col-span-2"
        >
          <FieldLabel htmlFor="contract-date-range">租期范围</FieldLabel>
          <div className="flex gap-2">
            <DateRangePicker
              id="contract-date-range"
              showDurationPresets
              withTime
              {...dateFeedback}
              aria-label="租期范围"
              value={{ from: values.startDate, to: values.endDate }}
              onChange={({ from, to }) =>
                onChange({
                  ...values,
                  startDate: from ?? '',
                  endDate: to ?? '',
                })
              }
              className="flex-1 min-w-0"
            />
            {values.startDate || values.endDate ? (
              <Button
                type="button"
                variant="outline"
                aria-label="清除租期"
                onClick={() =>
                  onChange({ ...values, startDate: '', endDate: '' })
                }
              >
                清除
              </Button>
            ) : null}
          </div>
          <ContractFieldMessage name="startDate" alternateName="endDate" />
        </Field>
      </FieldGroup>
      <FieldSet
        data-invalid={Boolean(errors.billingAnchor)}
        className="grid gap-2"
      >
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
            set(
              'billingAnchor',
              billingAnchor as ContractFormValues['billingAnchor'],
            )
          }
        >
          <FieldGroup className="flex flex-row mt-2 gap-2 items-center">
            <Field orientation="horizontal">
              <RadioGroupItem
                id="billing-contract-start"
                value="contract_start"
                aria-invalid={anchorFeedback['aria-invalid']}
              />
              <FieldLabel htmlFor="billing-contract-start">
                合同起始日
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem
                id="billing-calendar-month"
                value="calendar_month"
                aria-invalid={anchorFeedback['aria-invalid']}
              />
              <FieldLabel htmlFor="billing-calendar-month">自然月</FieldLabel>
            </Field>
          </FieldGroup>
        </RadioGroup>
        <ContractFieldMessage name="billingAnchor" />
      </FieldSet>
      <Field
        data-invalid={
          contractFeedbackProps(errors, 'paymentIntervalMonths')['aria-invalid']
        }
      >
        <FieldLabel htmlFor="contract-payment-interval">付款周期</FieldLabel>
        <Select
          value={values.paymentIntervalMonths || 'none'}
          onValueChange={(paymentIntervalMonths) =>
            set(
              'paymentIntervalMonths',
              (paymentIntervalMonths === 'none'
                ? ''
                : paymentIntervalMonths) as ContractFormValues['paymentIntervalMonths'],
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
      <Field
        data-invalid={
          contractFeedbackProps(errors, 'dueDaysBeforeText')['aria-invalid']
        }
      >
        <FieldLabel htmlFor="contract-due-days">到期提醒提前天数</FieldLabel>
        <Input
          id="contract-due-days"
          {...dueFeedback}
          inputMode="numeric"
          value={values.dueDaysBeforeText}
          onChange={(event) => set('dueDaysBeforeText', event.target.value)}
        />

        <ContractFieldMessage name="dueDaysBeforeText" />
      </Field>
      <Field
        data-invalid={contractFeedbackProps(errors, 'note')['aria-invalid']}
      >
        <FieldLabel htmlFor="contract-note">备注</FieldLabel>
        <textarea
          id="contract-note"
          {...contractFeedbackProps(errors, 'note')}
          className="bg-background border rounded-md min-h-24 p-2"
          value={values.note}
          onChange={(event) => set('note', event.target.value)}
        />

        <ContractFieldMessage name="note" />
      </Field>
      <ContractDepositFields
        deposits={values.deposits}
        onChange={(deposits) => set('deposits', deposits)}
      />
      {values.chargeSetup ? (
        <ContractChargeFields
          value={values.chargeSetup}
          onChange={(next) => set('chargeSetup', next)}
          errors={errors}
          showBaselines={canEditMeters}
        />
      ) : null}
      {values.chargeSetup ? (
        <p className="text-xs text-muted-foreground">
          入住底数与所选空间绑定，更换空间后须重新登记。
        </p>
      ) : null}
      {values.startDate && values.endDate && values.billingAnchor ? (
        <BillingPeriodPreview
          anchor={values.billingAnchor}
          periods={calendarPreview(
            values.startDate,
            values.endDate,
            values.billingAnchor,
            Number(values.paymentIntervalMonths) || 1,
          )}
        />
      ) : null}
    </section>
  )
}

export function calendarPreview(
  start: string,
  end: string,
  anchor: 'contract_start' | 'calendar_month',
  interval: number,
): string[] {
  if (
    !isValidDate(start, end) ||
    !Number.isFinite(interval) ||
    !Number.isInteger(interval) ||
    interval <= 0
  )
    return []
  start = start.slice(0, 10)
  end = end.slice(0, 10)
  if (anchor === 'contract_start')
    return [`${start} 起，按 ${interval} 个月一期`]
  const result: string[] = []
  let cursor = start
  const maxPeriods = 1200
  while (cursor <= end && result.length < maxPeriods) {
    const periodEnd = endOfMonth(addMonths(firstOfMonth(cursor), interval - 1))
    const boundedEnd = periodEnd < end ? periodEnd : end
    result.push(`${cursor} 至 ${boundedEnd}`)
    if (boundedEnd === end) break
    cursor = firstOfNextMonth(boundedEnd)
  }
  return result
}
function endOfMonth(value: string): string {
  const [rawYear, rawMonth] = value.split('-').map(Number)
  const year = rawYear ?? 0
  const month = rawMonth ?? 1
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`
}
function firstOfNextMonth(value: string): string {
  const [rawYear, rawMonth] = value.split('-').map(Number)
  const year = rawYear ?? 0
  const month = rawMonth ?? 1
  const next = month === 12 ? [year + 1, 1] : [year, month + 1]
  return `${next[0]}-${String(next[1]).padStart(2, '0')}-01`
}
function firstOfMonth(value: string): string {
  const [rawYear, rawMonth] = value.split('-').map(Number)
  const year = rawYear ?? 0
  const month = rawMonth ?? 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}
function addMonths(value: string, count: number): string {
  const [rawYear, rawMonth, rawDay] = value.split('-').map(Number)
  const year = rawYear ?? 0
  const month = rawMonth ?? 1
  const day = rawDay ?? 1
  const date = new Date(Date.UTC(year, month - 1 + count, day))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
