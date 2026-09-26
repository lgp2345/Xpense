import { useRef } from 'react'
import { DateRangePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type ContractFormValues, isValidDate } from '../contract-form-schema'
import { BillingPeriodPreview } from './billing-period-preview'

export function ContractTermsStep({
  values,
  onChange,
}: {
  values: ContractFormValues
  onChange: (values: ContractFormValues) => void
}) {
  const depositKeys = useRef<string[]>([])
  const depositSequence = useRef(0)
  const depositKey = (index: number) => {
    depositKeys.current[index] ??= `deposit-${depositSequence.current++}`
    return depositKeys.current[index] as string
  }
  const set = <K extends keyof ContractFormValues>(
    key: K,
    value: ContractFormValues[K],
  ) => onChange({ ...values, [key]: value })
  function updateDeposit(
    index: number,
    patch: Partial<ContractFormValues['deposits'][number]>,
  ) {
    set(
      'deposits',
      values.deposits.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    )
  }
  return (
    <section aria-labelledby="contract-terms-title" className="space-y-4">
      <h2 id="contract-terms-title" className="font-medium text-lg">
        设置合同条款
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label
          className="text-sm grid gap-2"
          htmlFor="contract-external-number"
        >
          合同编号
          <Input
            id="contract-external-number"
            value={values.externalContractNumber}
            onChange={(event) =>
              set('externalContractNumber', event.target.value)
            }
          />
        </label>
        <label className="text-sm grid gap-2" htmlFor="contract-rent-amount">
          月租（元）
          <Input
            id="contract-rent-amount"
            inputMode="decimal"
            value={values.rentAmountText}
            onChange={(event) => set('rentAmountText', event.target.value)}
          />
        </label>
        <div className="text-sm grid gap-2 sm:col-span-2">
          <label htmlFor="contract-date-range">租期范围</label>
          <div className="flex gap-2">
            <DateRangePicker
              id="contract-date-range"
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
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend id="billing-anchor-label" className="font-medium text-sm">
          计费方式
        </legend>
        <RadioGroup
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
          <div className="flex mt-2 gap-2 items-center">
            <div className="flex gap-2 items-center">
              <RadioGroupItem
                id="billing-contract-start"
                value="contract_start"
              />
              <Label htmlFor="billing-contract-start">合同起始日</Label>
            </div>
            <div className="flex gap-2 items-center">
              <RadioGroupItem
                id="billing-calendar-month"
                value="calendar_month"
              />
              <Label htmlFor="billing-calendar-month">自然月</Label>
            </div>
          </div>
        </RadioGroup>
      </fieldset>
      <div className="text-sm grid gap-2">
        <label htmlFor="contract-payment-interval">付款周期</label>
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
      </div>
      <label className="text-sm grid gap-2" htmlFor="contract-due-days">
        到期提醒提前天数
        <Input
          id="contract-due-days"
          inputMode="numeric"
          value={values.dueDaysBeforeText}
          onChange={(event) => set('dueDaysBeforeText', event.target.value)}
        />
      </label>
      <label className="text-sm grid gap-2" htmlFor="contract-note">
        备注
        <textarea
          id="contract-note"
          className="bg-background border rounded-md min-h-24 p-2"
          value={values.note}
          onChange={(event) => set('note', event.target.value)}
        />
      </label>
      <fieldset className="border rounded-md p-3">
        <legend className="font-medium text-sm">押金</legend>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            (() => {
              depositKeys.current.push(`deposit-${depositSequence.current++}`)
              set('deposits', [
                ...values.deposits,
                {
                  type: 'rental',
                  customName: '',
                  calculationMode: 'fixed_amount',
                  fixedAmountText: '',
                  rentMultipleText: '',
                },
              ])
            })()
          }
        >
          添加押金
        </Button>
        {values.deposits.map((deposit, index) => (
          <div
            key={depositKey(index)}
            className="mt-3 grid gap-3 rounded-md border bg-card/40 p-3 sm:grid-cols-2"
          >
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-sm font-medium text-muted-foreground">
                押金项 {index + 1}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/30"
                onClick={() =>
                  (() => {
                    depositKeys.current.splice(index, 1)
                    set(
                      'deposits',
                      values.deposits.filter((_, current) => current !== index),
                    )
                  })()
                }
              >
                移除
              </Button>
            </div>
            <div className="text-sm grid gap-1">
              <label htmlFor={`deposit-type-${index}`}>类型</label>
              <Select
                value={deposit.type}
                onValueChange={(type) =>
                  updateDeposit(index, {
                    type: type as typeof deposit.type,
                    customName: type === 'other' ? deposit.customName : '',
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
            {deposit.type === 'other' ? (
              <label
                className="text-sm grid gap-1"
                htmlFor={`deposit-name-${index}`}
              >
                押金名称
                <Input
                  id={`deposit-name-${index}`}
                  value={deposit.customName}
                  onChange={(event) =>
                    updateDeposit(index, { customName: event.target.value })
                  }
                />
              </label>
            ) : null}
            <fieldset className="grid gap-1">
              <legend
                id={`deposit-mode-label-${index}`}
                className="text-sm mb-2"
              >
                计算方式
              </legend>
              <RadioGroup
                aria-labelledby={`deposit-mode-label-${index}`}
                name={`deposit-mode-${index}`}
                value={deposit.calculationMode}
                onValueChange={(calculationMode) =>
                  updateDeposit(
                    index,
                    calculationMode === 'fixed_amount'
                      ? { calculationMode, rentMultipleText: '' }
                      : {
                          calculationMode: 'rent_multiple',
                          fixedAmountText: '',
                        },
                  )
                }
              >
                <div className="flex gap-2 items-center">
                  <div className="flex gap-2 items-center">
                    <RadioGroupItem
                      id={`deposit-fixed-${index}`}
                      value="fixed_amount"
                    />
                    <Label htmlFor={`deposit-fixed-${index}`}>固定金额</Label>
                  </div>
                  <div className="flex gap-2 items-center">
                    <RadioGroupItem
                      id={`deposit-multiple-${index}`}
                      value="rent_multiple"
                    />
                    <Label htmlFor={`deposit-multiple-${index}`}>
                      租金倍数
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </fieldset>
            {deposit.calculationMode === 'fixed_amount' ? (
              <label
                className="text-sm grid gap-1"
                htmlFor={`deposit-fixed-value-${index}`}
              >
                固定金额
                <Input
                  id={`deposit-fixed-value-${index}`}
                  inputMode="decimal"
                  value={deposit.fixedAmountText}
                  onChange={(event) =>
                    updateDeposit(index, {
                      fixedAmountText: event.target.value,
                    })
                  }
                />
              </label>
            ) : (
              <label
                className="text-sm grid gap-1"
                htmlFor={`deposit-multiple-value-${index}`}
              >
                租金倍数
                <Input
                  id={`deposit-multiple-value-${index}`}
                  inputMode="decimal"
                  value={deposit.rentMultipleText}
                  onChange={(event) =>
                    updateDeposit(index, {
                      rentMultipleText: event.target.value,
                    })
                  }
                />
              </label>
            )}
          </div>
        ))}
      </fieldset>
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
