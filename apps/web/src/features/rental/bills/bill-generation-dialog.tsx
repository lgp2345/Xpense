import { useForm, useStore } from '@tanstack/react-form'
import type {
  RentalBillGenerationResult,
  RentalBillPreview,
} from '@xpense/shared'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '../../../services/api-client'
import {
  createRentalBillGenerationAttempt,
  type RentalBillsApi,
} from '../../../services/rental-bills-api'
import {
  type BillGenerationValues,
  billGenerationFormSchema,
  parseTerminationAmount,
} from './bill-generation-form'
import { BillGenerationPreview } from './bill-generation-preview'

type Props = {
  organizationId: string
  contractId: string
  api: RentalBillsApi
  scope?: 'deposits'
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (result: RentalBillGenerationResult) => void
}
export function BillGenerationDialog(props: Props) {
  return props.open ? (
    <GenerationSession
      key={`${props.organizationId}:${props.contractId}:${props.scope ?? 'all'}`}
      {...props}
    />
  ) : null
}
function GenerationSession({
  contractId,
  api,
  scope,
  onOpenChange,
  onGenerated,
}: Props) {
  const form = useForm({
    defaultValues: {
      depositDueDates: {},
      unifiedDate: '',
      amountText: '',
      reason: '',
    } as BillGenerationValues,
    validators: { onChange: billGenerationFormSchema },
  })
  const values = useStore(form.store, (state) => state.values)
  const [preview, setPreview] = useState<RentalBillPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [valid, setValid] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const attempt = useRef<ReturnType<
    typeof createRentalBillGenerationAttempt
  > | null>(null)
  const requestSequence = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      inFlight.current = false
      requestSequence.current++
    }
  }, [])
  const confirmation = () => {
    const amount = parseTerminationAmount(form.state.values.amountText)
    return amount !== null && form.state.values.reason.trim()
      ? { finalAmountMinor: amount, reason: form.state.values.reason.trim() }
      : undefined
  }
  const refresh = async (page = 1) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setValid(false)
    setError(null)
    attempt.current = null
    const sequence = ++requestSequence.current
    try {
      const input = {
        contractId,
        ...(scope ? { scope } : {}),
        depositDueDates: form.state.values.depositDueDates,
        ...(confirmation() ? { terminationConfirmation: confirmation() } : {}),
        page,
        pageSize: 20,
      }
      let result: RentalBillPreview
      if (page > 1) {
        result = await api.previewBills({
          ...input,
          expectedVersion: preview?.version,
        })
      } else {
        const base = await api.previewBills({ ...input, depositDueDates: {} })
        if (!mounted.current || sequence !== requestSequence.current) return
        const dates = Object.fromEntries(
          base.missingDepositSourceKeys
            .filter((key) => input.depositDueDates[key])
            .map((key) => [key, input.depositDueDates[key] as string]),
        )
        result = Object.keys(dates).length
          ? await api.previewBills({ ...input, depositDueDates: dates })
          : base
        if (mounted.current && sequence === requestSequence.current)
          form.setFieldValue('depositDueDates', dates)
      }
      if (mounted.current && sequence === requestSequence.current) {
        setPreview(result)
        setValid(true)
      }
    } catch (cause) {
      if (mounted.current && sequence === requestSequence.current)
        setError(
          cause instanceof ApiError && cause.status === 409
            ? '账单已变化，请重新预览。'
            : '预览失败，请重试。',
        )
    } finally {
      if (mounted.current && sequence === requestSequence.current) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }
  // 初次打开只读预览；组织/合同 key 变化创建新的会话并丢弃旧响应。
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed 会话固定 contractId 与 api，避免编辑字段触发请求。
  useEffect(() => {
    void refresh()
  }, [])
  const change = () => {
    setValid(false)
    attempt.current = null
    setError(null)
    if (scope === 'deposits') void refresh()
  }
  const submit = async () => {
    if (inFlight.current || !preview || !valid || !preview.canGenerate) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    attempt.current ??= createRentalBillGenerationAttempt(api, {
      contractId,
      ...(scope ? { scope } : {}),
      depositDueDates: form.state.values.depositDueDates,
      expectedVersion: preview.version,
      ...(confirmation() ? { terminationConfirmation: confirmation() } : {}),
    })
    try {
      const result = await attempt.current.submit()
      if (mounted.current) {
        onGenerated(result)
        onOpenChange(false)
      }
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ApiError && cause.status === 409) {
          setValid(false)
          attempt.current = null
          form.setFieldValue('amountText', '')
          form.setFieldValue('reason', '')
          setError('账单已变化，请重新预览。')
        } else if (
          cause instanceof ApiError &&
          cause.status > 0 &&
          cause.status < 500
        ) {
          setValid(false)
          attempt.current = null
          setError(
            cause.status === 403
              ? '缺少生成或终止财务调整权限。'
              : cause.message,
          )
        } else setError('生成结果暂未确认，可重试原请求。')
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open)
      }}
    >
      <DialogContent className={scope === 'deposits'
        ? 'flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'
        : 'max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl'}>
        <DialogHeader className={scope === 'deposits' ? 'shrink-0 border-b px-5 py-5 pr-12 text-left sm:px-6' : undefined}>
          <DialogTitle>
            {scope === 'deposits' ? '预览并生成押金账单' : '预览并生成合同应收'}
          </DialogTitle>
          <DialogDescription>
            {scope === 'deposits'
              ? '核对押金金额并填写到期日。生成账单仅记录应收，不代表已收款。'
              : '本阶段仅记录应收，收款情况尚未登记'}
          </DialogDescription>
        </DialogHeader>
        <div className={scope === 'deposits' ? 'min-h-0 space-y-4 overflow-y-auto px-5 py-5 sm:px-6' : 'contents'}>
          {busy && !preview ? <p role="status">正在读取完整计费计划…</p> : null}
          {preview ? (
            <BillGenerationPreview
              scope={scope}
              preview={preview}
              values={values}
              busy={busy}
              valid={valid}
              onPageChange={(page) => void refresh(page)}
              onValuesChange={(updates) => {
                if (updates.depositDueDates !== undefined)
                  form.setFieldValue('depositDueDates', updates.depositDueDates)
                if (updates.unifiedDate !== undefined)
                  form.setFieldValue('unifiedDate', updates.unifiedDate)
                if (updates.amountText !== undefined)
                  form.setFieldValue('amountText', updates.amountText)
                if (updates.reason !== undefined)
                  form.setFieldValue('reason', updates.reason)
                if (updates.unifiedDate === undefined) change()
              }}
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className={scope === 'deposits' ? 'shrink-0 border-t bg-background px-5 py-4 sm:px-6' : undefined}>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          {scope !== 'deposits' || (error && !valid) ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {scope === 'deposits' ? '重试预览' : '更新预览'}
            </Button>
          ) : null}
          <Button
            disabled={
              busy ||
              !valid ||
              !preview?.canGenerate ||
              preview.createCount === 0
            }
            onClick={() => void submit()}
          >
            {busy ? '处理中…' : attempt.current ? '重试原请求' : '确认生成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
