import { DatePickerInput } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { BillCalculationLines } from './bill-calculation-lines'
import { formatBillAmount } from './bill-format'
import type { BillGenerationPreviewProps } from './bill-generation-preview'

export function DepositBillPreview({
  preview,
  values,
  busy,
  valid,
  onValuesChange,
  onPageChange,
}: BillGenerationPreviewProps) {
  const inputs =
    preview.depositInputs ??
    [
      ...new Set([
        ...preview.missingDepositSourceKeys,
        ...preview.items
          .filter(
            (item) => item.type === 'deposit' && item.disposition === 'create',
          )
          .map((item) => item.sourceKey),
        ...Object.keys(values.depositDueDates),
      ]),
    ].map((sourceKey) => {
      const item = preview.items.find((item) => item.sourceKey === sourceKey)
      return {
        sourceKey,
        label:
          item?.lines.find((line) => line.kind === 'deposit')?.label ?? '押金',
        amountMinor: item?.amountMinor,
      }
    })
  const missingCount = inputs.filter(
    (item) => !values.depositDueDates[item.sourceKey],
  ).length
  const existing = preview.items.filter(
    (item) => item.disposition === 'existing',
  )
  const pages = Math.max(1, Math.ceil(preview.total / preview.pageSize))

  return (
    <div className="space-y-5 min-w-0">
      <section
        aria-label="本次押金账单汇总"
        className="border-b space-y-2 pb-5"
      >
        <div className="flex flex-wrap text-sm gap-2 items-center justify-between">
          <p className="font-medium">本次应收押金</p>
          {preview.createCount > 0 ? (
            <p className="text-muted-foreground">
              新增 {preview.createCount} 张押金账单
            </p>
          ) : null}
        </div>
        <p className="font-semibold tracking-tight text-3xl tabular-nums">
          {formatBillAmount(preview.createTotals.depositAmountMinor)}
        </p>
        {preview.createCount > 0 && preview.existingCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            已有 {preview.existingCount} 张账单，本次不会重复生成。
          </p>
        ) : null}
      </section>

      {preview.createCount > 0 ? (
        <fieldset disabled={busy} className="space-y-5 min-w-0">
          <legend className="sr-only">待生成的押金账单</legend>
          {inputs.length > 1 ? (
            <div className="rounded-lg space-y-3 bg-muted/40 p-3">
              <div className="space-y-1">
                <label
                  htmlFor="unified-deposit-date"
                  className="font-medium text-sm"
                >
                  批量填写到期日（可选）
                </label>
                <p
                  id="unified-deposit-help"
                  className="text-xs text-muted-foreground leading-relaxed"
                >
                  为全部待生成账单填写相同日期。会覆盖下方已填写的到期日，仍可逐项修改。
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <DatePickerInput
                  id="unified-deposit-date"
                  aria-label="统一押金到期日"
                  aria-describedby="unified-deposit-help"
                  buttonLabel="选择统一到期日"
                  disabled={busy}
                  value={values.unifiedDate}
                  onChange={(date) =>
                    onValuesChange({ unifiedDate: date ?? '' })
                  }
                />
                <Button
                  variant="outline"
                  disabled={busy || !values.unifiedDate}
                  onClick={() =>
                    onValuesChange({
                      depositDueDates: Object.fromEntries(
                        inputs.map(({ sourceKey }) => [
                          sourceKey,
                          values.unifiedDate,
                        ]),
                      ),
                    })
                  }
                >
                  填入全部待生成账单
                </Button>
              </div>
            </div>
          ) : null}
          <section aria-labelledby="deposit-items-title" className="space-y-1">
            <div className="flex flex-wrap pb-2 gap-2 items-center justify-between">
              <h2 id="deposit-items-title" className="font-medium text-sm">
                押金账单明细
              </h2>
              <p className="text-xs text-muted-foreground">
                每项到期日均为必填
              </p>
            </div>
            <div className="divide-y">
              {inputs.map(({ sourceKey, label, amountMinor }, index) => {
                const lines = preview.items.find(
                  (item) => item.sourceKey === sourceKey,
                )?.lines
                return (
                  <fieldset
                    key={sourceKey}
                    aria-labelledby={`deposit-name-${index}`}
                    className="min-w-0 grid py-4 gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-start"
                  >
                    <div className="space-y-1 min-w-0">
                      <h3
                        id={`deposit-name-${index}`}
                        className="font-medium text-sm break-words"
                      >
                        {label}
                      </h3>
                      {amountMinor === undefined ? (
                        <p className="text-xs text-muted-foreground">
                          金额需翻页核对
                        </p>
                      ) : (
                        <p className="font-medium text-lg tabular-nums">
                          {formatBillAmount(amountMinor)}
                        </p>
                      )}
                      {lines?.length ? (
                        <details className="pt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            查看金额依据
                          </summary>
                          <BillCalculationLines lines={lines} />
                        </details>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`deposit-date-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        到期日
                      </label>
                      <DatePickerInput
                        id={`deposit-date-${index}`}
                        aria-label={`${label}（${index + 1}）到期日`}
                        buttonLabel={`选择${label}到期日`}
                        disabled={busy}
                        value={values.depositDueDates[sourceKey]}
                        onChange={(date) => {
                          const dates = { ...values.depositDueDates }
                          if (date) dates[sourceKey] = date
                          else delete dates[sourceKey]
                          onValuesChange({ depositDueDates: dates })
                        }}
                      />
                    </div>
                  </fieldset>
                )
              })}
            </div>
          </section>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {busy
              ? '正在更新账单预览…'
              : missingCount > 0
                ? `还有 ${missingCount} 项未填写到期日`
                : valid && preview.canGenerate
                  ? '到期日已填写，可确认生成。'
                  : '请完成预览后再确认生成。'}
          </p>
        </fieldset>
      ) : (
        <div className="rounded-lg space-y-1 bg-muted/40 p-4">
          <p className="font-medium text-sm">
            {preview.existingCount > 0
              ? '全部押金账单已生成'
              : '暂无需要生成的押金账单'}
          </p>
          <p className="text-sm text-muted-foreground">
            {preview.existingCount > 0
              ? '可在下方查看已有账单，无需再次生成。'
              : '合同暂无可生成的押金项目。'}
          </p>
        </div>
      )}

      {!preview.depositInputs && preview.existingCount === 0 && pages > 1 ? (
        <DepositPreviewPagination {...{ preview, busy, valid, onPageChange }} />
      ) : null}

      {preview.existingCount > 0 ? (
        <details className="border-t pt-4">
          <summary className="cursor-pointer font-medium text-sm">
            查看已生成账单（{preview.existingCount}）
          </summary>
          <section aria-label="已生成的押金账单" className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">
              以下账单仅供核对，金额和到期日保持原值。
            </p>
            {existing.length ? (
              existing.map((item) => (
                <div
                  key={item.sourceKey}
                  className="border-b text-sm grid py-3 gap-2 sm:gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <p className="break-words">
                    {item.lines.find((line) => line.kind === 'deposit')
                      ?.label ?? '押金'}
                  </p>
                  <p className="tabular-nums">
                    {formatBillAmount(item.amountMinor)}
                  </p>
                  <p className="text-muted-foreground">
                    到期日{' '}
                    <span>
                      {item.dueDate?.replaceAll('-', '/') ?? '未设置'}
                    </span>
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                本页没有已生成的押金账单。
              </p>
            )}
            <DepositPreviewPagination
              {...{ preview, busy, valid, onPageChange }}
            />
          </section>
        </details>
      ) : null}
    </div>
  )
}

function DepositPreviewPagination({
  preview,
  busy,
  valid,
  onPageChange,
}: Pick<
  BillGenerationPreviewProps,
  'preview' | 'busy' | 'valid' | 'onPageChange'
>) {
  const pages = Math.max(1, Math.ceil(preview.total / preview.pageSize))
  if (pages <= 1) return null
  return (
    <nav
      aria-label="押金账单分页"
      className="flex flex-wrap text-sm gap-2 items-center justify-end"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !valid || preview.page <= 1}
        onClick={() => onPageChange(preview.page - 1)}
      >
        上一页
      </Button>
      <span>
        第 {preview.page} 页，共 {pages} 页
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !valid || preview.page >= pages}
        onClick={() => onPageChange(preview.page + 1)}
      >
        下一页
      </Button>
    </nav>
  )
}
