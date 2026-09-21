import { useBlocker } from '@tanstack/react-router'
import type { PermissionKey, RentalContractAvailability } from '@xpense/shared'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RentalApi } from '@/services/rental-api'
import {
  type ContractFormValues,
  defaultContractFormValues,
} from './contract-form-schema'
import { ContractLocalReviewStep } from './steps/contract-local-review-step'
import { ContractPartiesStep } from './steps/contract-parties-step'
import { ContractReviewStep } from './steps/contract-review-step'
import { ContractSpacesStep } from './steps/contract-spaces-step'
import { ContractTermsStep } from './steps/contract-terms-step'
import { useContractDraft } from './use-contract-draft'

export type ContractFormSearch = {
  draftId?: string
  propertyId?: string
  spaceIds?: string[]
}

export type ContractFormNavigate = (
  options:
    | {
        search: { draftId: string }
        replace: true
      }
    | {
        to: '/rentals/contracts/$contractId'
        params: { contractId: string }
        replace: true
      },
) => Promise<unknown> | unknown

export type ContractFormPageInput = {
  api: RentalApi
  organizationId: string
  permissions: readonly PermissionKey[]
  canCreate: boolean
  navigate: ContractFormNavigate
  search: ContractFormSearch
}

export type ContractFormPageProps = ContractFormPageInput & {
  onNonDraft?: (
    detail: Parameters<
      NonNullable<Parameters<typeof useContractDraft>[0]['onNonDraft']>
    >[0],
  ) => void
}

const labels = ['房产与空间', '承租方', '条款', '复核'] as const

export function ContractFormPage({
  api,
  organizationId,
  permissions,
  canCreate,
  navigate,
  search,
  onNonDraft,
}: ContractFormPageProps) {
  const canRead = permissions.includes('rental_contracts:read')
  const canUpdate = permissions.includes('rental_contracts:update')
  const [values, setValues] = useState<ContractFormValues>(() =>
    defaultContractFormValues(search.propertyId),
  )
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [propertyValidationGeneration, setPropertyValidationGeneration] =
    useState<number | null>(null)
  const [propertyValidationError, setPropertyValidationError] = useState<
    string | null
  >(null)
  const [nonDraft, setNonDraft] = useState<string | null>(null)
  const hydratedDraftId = useRef<string | undefined>(undefined)
  const completedContractId = useRef<string | undefined>(undefined)
  const [selectionNames, setSelectionNames] = useState<Record<string, string>>({})
  const captureNames = useCallback((names: Record<string, string>) => {
    setSelectionNames((current) => ({ ...current, ...names }))
  }, [])
  const scope = `${organizationId}:${search.draftId ?? ''}:${search.propertyId ?? ''}:${canRead}:${canUpdate}:${canCreate}`
  const scopeRef = useRef({ key: scope, generation: 0 })
  if (scopeRef.current.key !== scope) {
    scopeRef.current = { key: scope, generation: scopeRef.current.generation + 1 }
  }
  const propertyValidationPending =
    propertyValidationGeneration === scopeRef.current.generation
  const seenBaselineVersion = useRef(0)
  const seenCanonicalResetVersion = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 组织或路由变化时重置整个表单会话
  useEffect(() => {
    setNonDraft(null)
    hydratedDraftId.current = undefined
    seenBaselineVersion.current = 0
    seenCanonicalResetVersion.current = 0
    setValues(defaultContractFormValues(search.propertyId))
    setSelectionNames({})
    setPropertyValidationError(null)
    setPropertyValidationGeneration(null)
    completedContractId.current = undefined
  }, [organizationId, search.draftId, search.propertyId])
  const handleConfirmed = useCallback(
    (id: string) => {
      completedContractId.current = id
      void navigate({
        to: '/rentals/contracts/$contractId',
        params: { contractId: id },
        replace: true,
      })
    },
    [navigate],
  )
  const handleNonDraft = useCallback(
    (
      detail: Parameters<
        NonNullable<Parameters<typeof useContractDraft>[0]['onNonDraft']>
      >[0],
    ) => {
      setNonDraft(detail.id)
      onNonDraft?.(detail)
    },
    [onNonDraft],
  )
  const draft = useContractDraft({
    api,
    organizationId,
    draftId: search.draftId,
    seed: search.propertyId
      ? { propertyId: search.propertyId, spaces: [] }
      : undefined,
    canRead,
    canCreate,
    canUpdate,
    onConfirmed: handleConfirmed,
    onNonDraft: handleNonDraft,
  })

  useEffect(() => {
    if (!draft.serverDraft || search.draftId !== draft.serverDraft.id) return
    if (draft.canonicalResetVersion !== seenCanonicalResetVersion.current) {
      seenCanonicalResetVersion.current = draft.canonicalResetVersion
      setValues(draft.initialValues)
      hydratedDraftId.current = draft.serverDraft.id
      return
    }
    if (draft.baselineVersion !== seenBaselineVersion.current) {
      seenBaselineVersion.current = draft.baselineVersion
      if (
        hydratedDraftId.current !== draft.serverDraft.id ||
        !draft.isDirty(values)
      ) {
        setValues(draft.initialValues)
      }
      hydratedDraftId.current = draft.serverDraft.id
      return
    }
    if (hydratedDraftId.current !== draft.serverDraft.id) {
      setValues(draft.initialValues)
      hydratedDraftId.current = draft.serverDraft.id
    }
  }, [
    draft.initialValues,
    draft.baselineVersion,
    draft.canonicalResetVersion,
    draft.serverDraft,
    draft.isDirty,
    search.draftId,
    values,
  ])

  const hydrationPending = Boolean(
    search.draftId &&
    draft.serverDraft &&
    hydratedDraftId.current !== draft.serverDraft.id,
  )
  const dirty = hydrationPending ? false : draft.isDirty(values)
  const hasUnsavedWork =
    !hydrationPending && (dirty || draft.operation !== 'idle')
  const shouldBlockNavigation = useCallback(
    (args: {
      action?: string
      next?: { fullPath?: string; search?: unknown }
    }) => {
      if (
        completedContractId.current &&
        args.next?.fullPath === '/rentals/contracts/$contractId'
      ) return false
      return hasUnsavedWork
    },
    [hasUnsavedWork],
  )
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: hasUnsavedWork,
    withResolver: true,
  })
  const blockedFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const headingId = [
      'contract-spaces-title',
      'contract-parties-title',
      'contract-terms-title',
      'contract-review-title',
    ][draft.step]
    const heading = headingId ? document.getElementById(headingId) : null
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1
      heading.focus()
    }
  }, [draft.step])

  if (!canCreate || !canRead || !canUpdate) return <PermissionNotice />
  if (!draft.requestReady) return <ApiUnavailableNotice />
  if (draft.isLoading) return <Loading />
  if (draft.loadError)
    return (
      <LoadError message={draft.error?.message} onRetry={draft.retryLoad} />
    )
  if (hydrationPending) return <Loading />
  if (nonDraft) return <NonDraftNotice contractId={nonDraft} />

  const step = draft.step
  const busy = draft.operation !== 'idle' || propertyValidationPending
  const creationPending = !search.draftId && draft.operation === 'confirming'
  async function next() {
    if (step === 0 && !draft.draftId) {
      const requestScope = scopeRef.current.generation
      const propertyId = values.propertyId
      setPropertyValidationError(null)
      if (!propertyId) {
        await draft.saveAndNext(values)
        return
      }
      if (!api.getProperty) {
        setPropertyValidationError('房产验证失败，请稍后重试。')
        return
      }
      setPropertyValidationGeneration(requestScope)
      try {
        const property = await api.getProperty(propertyId)
        if (
          scopeRef.current.generation !== requestScope ||
          valuesRef.current.propertyId !== propertyId ||
          property.id !== propertyId
        )
          return
        if (!property.isActive) {
          setPropertyValidationError('房产不可用，请重新选择启用房产。')
          return
        }
        await draft.saveAndNext(values)
      } catch {
        if (scopeRef.current.generation === requestScope)
          setPropertyValidationError('房产验证失败，请稍后重试。')
      } finally {
        if (scopeRef.current.generation === requestScope)
          setPropertyValidationGeneration(null)
      }
      return
    }
    await draft.saveAndNext(values)
  }
  return (
    <main
      className="mx-auto space-y-5 max-w-4xl p-4 sm:p-6 lg:p-8"
      aria-busy={busy}
    >
      <header>
        <h1 className="font-medium tracking-tight text-2xl">新建合同</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {search.draftId
            ? '继续填写已有草稿，确认前会再次检查空间可用性。'
            : '按步骤填写合同资料，复核后创建合同。提交前的内容仅保留在当前页面。'}
        </p>
      </header>
      <ol
        aria-label="合同创建步骤"
        className="text-center text-xs grid gap-2 grid-cols-4 sm:text-sm"
      >
        {labels.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            className={`rounded-md border p-2 ${step === index ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground'}`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {propertyValidationError ||
      (draft.error && draft.error.kind !== 'availability') ? (
        <ErrorSummary
          key={propertyValidationError ?? draft.error?.message}
          message={
            propertyValidationError ??
            draft.error?.message ??
            '操作失败，请稍后重试。'
          }
          onRetry={
            draft.error?.kind === 'save' && draft.canRetrySave
              ? () => void draft.retrySave(values)
              : undefined
          }
          onEditTerms={
            step === 0 && draft.error?.kind === 'confirm'
              ? () => draft.setStep(2)
              : undefined
          }
          onEditSpaces={
            step === 0 && draft.error?.kind === 'confirm'
              ? () => draft.setStep(0)
              : undefined
          }
        />
      ) : null}
      {step === 0 &&
      draft.availability &&
      !draft.availability.result.available ? (
        <AvailabilitySummary
          availability={draft.availability.result}
          onEditTerms={() => draft.setStep(2)}
        />
      ) : null}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <fieldset disabled={creationPending} className="min-w-0">
            {step === 0 ? (
              <ContractSpacesStep
                api={api}
                organizationId={organizationId}
                values={values}
                onChange={setValues}
                permissions={permissions}
                onNames={captureNames}
                showPropertySelector={!search.draftId}
                seedSpaceIds={search.draftId ? undefined : search.spaceIds}
              />
            ) : step === 1 ? (
              <ContractPartiesStep
                api={api}
                organizationId={organizationId}
                permissions={permissions}
                onNames={captureNames}
                values={values}
                onChange={setValues}
              />
            ) : step === 2 ? (
              <ContractTermsStep values={values} onChange={setValues} />
            ) : !search.draftId ? (
              <ContractLocalReviewStep
                values={values}
                names={selectionNames}
                busy={busy}
                onConfirm={() => void draft.checkAndConfirm(values)}
                onEdit={(nextStep) => draft.setStep(nextStep)}
              />
            ) : (
              <ContractReviewStep
                values={values}
                serverDraft={draft.serverDraft}
                availability={draft.availability?.result ?? null}
                dirty={dirty}
                confirming={
                  draft.operation === 'checking' ||
                  draft.operation === 'confirming'
                }
                onConfirm={() => void draft.checkAndConfirm(values)}
                onEdit={(nextStep) => draft.setStep(nextStep)}
              />
            )}
          </fieldset>
        </CardContent>
      </Card>
      {step < 3 ? (
        <div className="flex gap-3 justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => draft.setStep((step - 1) as 0 | 1 | 2)}
          >
            上一步
          </Button>
          <Button type="button" disabled={busy} onClick={() => void next()}>
            {busy
              ? (search.draftId ? '保存中...' : '校验中...')
              : !search.draftId
                ? '下一步'
                : step === 0
                  ? '保存空间并下一步'
                  : '保存并继续'}
          </Button>
        </div>
      ) : null}
      {busy ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {search.draftId
            ? '正在保存合同草稿，请稍候。'
            : creationPending
              ? '正在创建合同，请稍候。'
              : '正在校验合同资料，请稍候。'}
        </p>
      ) : null}
      {blocker.status === 'blocked' ? (
        <AlertDialog open>
          <AlertDialogContent
            onOpenAutoFocus={(event) => {
              if (
                !blockedFocusRef.current &&
                document.activeElement instanceof HTMLElement
              ) {
                blockedFocusRef.current = document.activeElement
              }
              event.preventDefault()
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              blockedFocusRef.current?.focus()
              blockedFocusRef.current = null
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>离开合同创建？</AlertDialogTitle>
              <AlertDialogDescription>
                {draft.draftId
                  ? '当前表单有未保存内容或正在保存，离开后可以从草稿继续。'
                  : creationPending
                    ? '正在创建合同，请等待提交完成后再离开。'
                    : '合同尚未提交，离开将丢弃当前填写内容。'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => blocker.reset()}>
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={creationPending}
                onClick={() => {
                  if (creationPending) return
                  draft.cancelSession()
                  blocker.proceed()
                }}
              >
                {draft.draftId ? '离开并保留草稿' : '离开并丢弃'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </main>
  )
}

function ErrorSummary({
  message,
  onRetry,
  onEditTerms,
  onEditSpaces,
}: {
  message: string
  onRetry?: () => void
  onEditTerms?: () => void
  onEditSpaces?: () => void
}) {
  const summaryRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    summaryRef.current?.focus()
  }, [])
  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      className="border rounded-md bg-destructive/10 border-destructive/30 text-sm text-destructive p-3"
    >
      {message}
      {onRetry ? (
        <Button
          variant="link"
          className="ml-2 px-0"
          onClick={() => void onRetry()}
        >
          重试保存
        </Button>
      ) : null}
      {onEditTerms ? (
        <Button variant="link" className="ml-2 px-0" onClick={onEditTerms}>
          返回修改条款
        </Button>
      ) : null}
      {onEditSpaces ? (
        <Button variant="link" className="ml-2 px-0" onClick={onEditSpaces}>
          返回修改空间
        </Button>
      ) : null}
    </div>
  )
}
function PermissionNotice() {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <p className="bg-muted border rounded-md text-sm text-muted-foreground p-4">
        你没有完成合同创建所需的权限。
      </p>
    </main>
  )
}
function ApiUnavailableNotice() {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <p className="bg-muted border rounded-md text-sm text-muted-foreground p-4">
        合同服务暂不可用，请稍后重试。
      </p>
    </main>
  )
}

function AvailabilitySummary({
  availability,
  onEditTerms,
}: {
  availability: RentalContractAvailability
  onEditTerms: () => void
}) {
  return (
    <div
      role="alert"
      className="border rounded-md bg-destructive/10 border-destructive/30 text-sm text-destructive p-3"
    >
      <p>存在空间合同冲突，请返回修改。</p>
      {availability.conflicts.map((conflict) => (
        <p key={`${conflict.contractId}-${conflict.spaceId}`}>
          {conflict.contractNumber} · {conflict.spaceName}
        </p>
      ))}
      <Button variant="link" className="ml-2 px-0" onClick={onEditTerms}>
        返回修改条款
      </Button>
    </div>
  )
}
function Loading() {
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <span className="sr-only">正在加载合同草稿...</span>
        </CardContent>
      </Card>
    </main>
  )
}
function LoadError({
  message,
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div
        role="alert"
        className="border rounded-md bg-destructive/10 border-destructive/30 text-sm text-destructive p-3"
      >
        {message ?? '合同草稿加载失败。'}
        <Button variant="link" className="ml-2 px-0" onClick={onRetry}>
          重试
        </Button>
      </div>
    </main>
  )
}
function NonDraftNotice({ contractId }: { contractId: string }) {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div role="alert" className="bg-muted border rounded-md text-sm p-4">
        该合同已不是草稿，无法继续编辑。
        <a className="ml-2 underline" href={`/rentals/contracts/${contractId}`}>
          查看合同详情
        </a>
      </div>
    </main>
  )
}

export function canCreateRentalContract(
  permissions: readonly PermissionKey[],
): boolean {
  return (
    permissions.includes('rental_contracts:create') &&
    permissions.includes('rental_contracts:read') &&
    permissions.includes('rental_contracts:update')
  )
}
