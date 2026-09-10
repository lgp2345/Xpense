import { useBlocker } from "@tanstack/react-router";
import type { PermissionKey, RentalContractAvailability } from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RentalApi } from "@/services/rental-api";
import { type ContractFormValues, defaultContractFormValues } from "./contract-form-schema";
import { ContractPartiesStep } from "./steps/contract-parties-step";
import { ContractReviewStep } from "./steps/contract-review-step";
import { ContractSpacesStep } from "./steps/contract-spaces-step";
import { ContractTermsStep } from "./steps/contract-terms-step";
import { useContractDraft } from "./use-contract-draft";

export type ContractFormSearch = {
  draftId?: string;
  propertyId?: string;
  spaceIds?: string[];
};

export type ContractFormNavigate = (
  options:
    | {
        search: { draftId: string };
        replace: true;
      }
    | {
        to: "/rentals/contracts/$contractId";
        params: { contractId: string };
        replace: true;
      },
) => Promise<unknown> | unknown;

export type ContractFormPageInput = {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  canCreate: boolean;
  navigate: ContractFormNavigate;
  search: ContractFormSearch;
};

export type ContractFormPageProps = ContractFormPageInput & {
  onNonDraft?: (
    detail: Parameters<NonNullable<Parameters<typeof useContractDraft>[0]["onNonDraft"]>>[0],
  ) => void;
};

const labels = ["房产与空间", "承租方", "条款", "复核"] as const;

export function ContractFormPage({
  api,
  organizationId,
  permissions,
  canCreate,
  navigate,
  search,
  onNonDraft,
}: ContractFormPageProps) {
  const canRead = permissions.includes("rental_contracts:read");
  const canUpdate = permissions.includes("rental_contracts:update");
  const [values, setValues] = useState<ContractFormValues>(() =>
    defaultContractFormValues(search.propertyId),
  );
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [propertyValidationPending, setPropertyValidationPending] = useState(false);
  const [propertyValidationError, setPropertyValidationError] = useState<string | null>(null);
  const [nonDraft, setNonDraft] = useState<string | null>(null);
  const hydratedDraftId = useRef<string | undefined>(undefined);
  const createdDraftId = useRef<string | undefined>(undefined);
  const pendingDraftRouteId = useRef<string | undefined>(undefined);
  const previousOrganizationId = useRef(organizationId);
  const seenBaselineVersion = useRef(0);
  const seenCanonicalResetVersion = useRef(0);
  useEffect(() => {
    setNonDraft(null);
    hydratedDraftId.current = undefined;
    seenBaselineVersion.current = 0;
    seenCanonicalResetVersion.current = 0;
    const isOwnCreate = Boolean(search.draftId && createdDraftId.current === search.draftId);
    if (previousOrganizationId.current !== organizationId || !isOwnCreate) {
      setValues(defaultContractFormValues(search.propertyId));
    }
    previousOrganizationId.current = organizationId;
    if (isOwnCreate) createdDraftId.current = undefined;
  }, [organizationId, search.draftId, search.propertyId]);
  const handleDraftId = useCallback(
    (id: string) => {
      createdDraftId.current = id;
      pendingDraftRouteId.current = id;
      void Promise.resolve(
        navigate({
          search: { draftId: id },
          replace: true,
        }),
      ).finally(() => {
        if (pendingDraftRouteId.current === id) pendingDraftRouteId.current = undefined;
      });
    },
    [navigate],
  );
  const handleConfirmed = useCallback(
    (id: string) =>
      void navigate({
        to: "/rentals/contracts/$contractId",
        params: { contractId: id },
        replace: true,
      }),
    [navigate],
  );
  const handleNonDraft = useCallback(
    (detail: Parameters<NonNullable<Parameters<typeof useContractDraft>[0]["onNonDraft"]>>[0]) => {
      setNonDraft(detail.id);
      onNonDraft?.(detail);
    },
    [onNonDraft],
  );
  const draft = useContractDraft({
    api,
    organizationId,
    draftId: search.draftId,
    seed: search.propertyId ? { propertyId: search.propertyId, spaces: [] } : undefined,
    canRead,
    canCreate,
    canUpdate,
    onDraftId: handleDraftId,
    onConfirmed: handleConfirmed,
    onNonDraft: handleNonDraft,
  });

  useEffect(() => {
    if (!draft.serverDraft || search.draftId !== draft.serverDraft.id) return;
    if (draft.canonicalResetVersion !== seenCanonicalResetVersion.current) {
      seenCanonicalResetVersion.current = draft.canonicalResetVersion;
      setValues(draft.initialValues);
      hydratedDraftId.current = draft.serverDraft.id;
      return;
    }
    if (draft.baselineVersion !== seenBaselineVersion.current) {
      seenBaselineVersion.current = draft.baselineVersion;
      if (hydratedDraftId.current !== draft.serverDraft.id || !draft.isDirty(values)) {
        setValues(draft.initialValues);
      }
      hydratedDraftId.current = draft.serverDraft.id;
      return;
    }
    if (hydratedDraftId.current !== draft.serverDraft.id) {
      setValues(draft.initialValues);
      hydratedDraftId.current = draft.serverDraft.id;
    }
  }, [
    draft.initialValues,
    draft.baselineVersion,
    draft.canonicalResetVersion,
    draft.serverDraft,
    draft.isDirty,
    search.draftId,
    values,
  ]);

  const isOwnCreatedRoute = Boolean(search.draftId && createdDraftId.current === search.draftId);
  const hydrationPending = Boolean(
    search.draftId &&
      draft.serverDraft &&
      !isOwnCreatedRoute &&
      hydratedDraftId.current !== draft.serverDraft.id,
  );
  const dirty = hydrationPending ? false : draft.isDirty(values);
  const hasUnsavedWork = !hydrationPending && (dirty || draft.operation !== "idle");
  const shouldBlockNavigation = useCallback(
    (args: { action?: string; next?: { fullPath?: string; search?: unknown } }) => {
      const nextSearch =
        args.next?.search && typeof args.next.search === "object"
          ? (args.next.search as { draftId?: unknown })
          : undefined;
      const isOwnDraftRouteReplace =
        args.action === "REPLACE" &&
        args.next?.fullPath === "/rentals/contracts/new" &&
        nextSearch?.draftId === pendingDraftRouteId.current;
      if (isOwnDraftRouteReplace) {
        pendingDraftRouteId.current = undefined;
        return false;
      }
      return hasUnsavedWork;
    },
    [hasUnsavedWork],
  );
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: hasUnsavedWork,
    withResolver: true,
  });
  const blockedFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const headingId = [
      "contract-spaces-title",
      "contract-parties-title",
      "contract-terms-title",
      "contract-review-title",
    ][draft.step];
    const heading = headingId ? document.getElementById(headingId) : null;
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [draft.step]);

  if (!canCreate || !canRead || !canUpdate) return <PermissionNotice />;
  if (!draft.requestReady) return <ApiUnavailableNotice />;
  if (draft.isLoading) return <Loading />;
  if (draft.loadError)
    return <LoadError message={draft.error?.message} onRetry={draft.retryLoad} />;
  if (hydrationPending) return <Loading />;
  if (nonDraft) return <NonDraftNotice contractId={nonDraft} />;

  const step = draft.step;
  const busy = draft.operation !== "idle" || propertyValidationPending;
  const creationPending = draft.operation === "creating" && !draft.draftId;
  async function next() {
    if (step === 0 && !draft.draftId) {
      const propertyId = values.propertyId;
      setPropertyValidationError(null);
      if (!propertyId) {
        await draft.saveAndNext(values);
        return;
      }
      if (!api.getProperty) {
        setPropertyValidationError("房产验证失败，请稍后重试。");
        return;
      }
      setPropertyValidationPending(true);
      try {
        const property = await api.getProperty(propertyId);
        if (valuesRef.current.propertyId !== propertyId || property.id !== propertyId) return;
        if (!property.isActive) {
          setPropertyValidationError("房产不可用，请重新选择启用房产。");
          return;
        }
        await draft.saveAndNext(values);
      } catch {
        setPropertyValidationError("房产验证失败，请稍后重试。");
      } finally {
        setPropertyValidationPending(false);
      }
      return;
    }
    await draft.saveAndNext(values);
  }
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8" aria-busy={busy}>
      <header>
        <h1 className="text-2xl font-medium tracking-tight">新建合同</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每一步都会先保存草稿，确认前服务端会再次检查空间可用性。
        </p>
      </header>
      <ol
        aria-label="合同创建步骤"
        className="grid grid-cols-4 gap-2 text-center text-xs sm:text-sm"
      >
        {labels.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={`rounded-md border p-2 ${step === index ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground"}`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {propertyValidationError || (draft.error && draft.error.kind !== "availability") ? (
        <ErrorSummary
          key={propertyValidationError ?? draft.error?.message}
          message={propertyValidationError ?? draft.error?.message ?? "操作失败，请稍后重试。"}
          onRetry={
            draft.error?.kind === "save" && draft.canRetrySave
              ? () => void draft.retrySave(values)
              : undefined
          }
          onEditTerms={
            step === 0 && draft.error?.kind === "confirm" ? () => draft.setStep(2) : undefined
          }
          onEditSpaces={
            step === 0 && draft.error?.kind === "confirm" ? () => draft.setStep(0) : undefined
          }
        />
      ) : null}
      {step === 0 && draft.availability && !draft.availability.result.available ? (
        <AvailabilitySummary
          availability={draft.availability.result}
          onEditTerms={() => draft.setStep(2)}
        />
      ) : null}
      <Card>
        <CardContent className="p-4 sm:p-6">
          {step === 0 ? (
            <ContractSpacesStep
              api={api}
              organizationId={organizationId}
              values={values}
              onChange={setValues}
              permissions={permissions}
              showPropertySelector={!search.draftId}
              seedSpaceIds={search.draftId ? undefined : search.spaceIds}
            />
          ) : step === 1 ? (
            <ContractPartiesStep
              api={api}
              organizationId={organizationId}
              permissions={permissions}
              values={values}
              onChange={setValues}
            />
          ) : step === 2 ? (
            <ContractTermsStep values={values} onChange={setValues} />
          ) : (
            <ContractReviewStep
              values={values}
              serverDraft={draft.serverDraft}
              availability={draft.availability?.result ?? null}
              dirty={dirty}
              confirming={draft.operation === "checking" || draft.operation === "confirming"}
              onConfirm={() => void draft.checkAndConfirm(values)}
              onEdit={(nextStep) => draft.setStep(nextStep)}
            />
          )}
        </CardContent>
      </Card>
      {step < 3 ? (
        <div className="flex justify-between gap-3">
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
              ? "保存中..."
              : step === 0 && !draft.draftId
                ? "创建草稿"
                : step === 0
                  ? "保存空间并下一步"
                  : "保存并继续"}
          </Button>
        </div>
      ) : null}
      {busy ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          正在保存合同草稿，请稍候。
        </p>
      ) : null}
      {blocker.status === "blocked" ? (
        <AlertDialog open>
          <AlertDialogContent
            onOpenAutoFocus={(event) => {
              if (!blockedFocusRef.current && document.activeElement instanceof HTMLElement) {
                blockedFocusRef.current = document.activeElement;
              }
              event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              blockedFocusRef.current?.focus();
              blockedFocusRef.current = null;
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>离开合同创建？</AlertDialogTitle>
              <AlertDialogDescription>
                {draft.draftId
                  ? "当前表单有未保存内容或正在保存，离开后可以从草稿继续。"
                  : creationPending
                    ? "正在创建草稿，请等待创建完成后再离开；离开将丢弃未保存内容。"
                    : "当前表单尚未创建草稿，离开将丢弃未保存内容。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => blocker.reset()}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={creationPending}
                onClick={() => {
                  if (creationPending) return;
                  draft.cancelSession();
                  blocker.proceed();
                }}
              >
                {draft.draftId ? "离开并保留草稿" : "离开并丢弃"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </main>
  );
}

function ErrorSummary({
  message,
  onRetry,
  onEditTerms,
  onEditSpaces,
}: {
  message: string;
  onRetry?: () => void;
  onEditTerms?: () => void;
  onEditSpaces?: () => void;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    summaryRef.current?.focus();
  }, []);
  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {message}
      {onRetry ? (
        <Button variant="link" className="ml-2 px-0" onClick={() => void onRetry()}>
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
  );
}
function PermissionNotice() {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">
        你没有完成合同创建所需的权限。
      </p>
    </main>
  );
}
function ApiUnavailableNotice() {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">
        合同服务暂不可用，请稍后重试。
      </p>
    </main>
  );
}

function AvailabilitySummary({
  availability,
  onEditTerms,
}: {
  availability: RentalContractAvailability;
  onEditTerms: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
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
  );
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
  );
}
function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {message ?? "合同草稿加载失败。"}
        <Button variant="link" className="ml-2 px-0" onClick={onRetry}>
          重试
        </Button>
      </div>
    </main>
  );
}
function NonDraftNotice({ contractId }: { contractId: string }) {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div role="alert" className="rounded-md border bg-muted p-4 text-sm">
        该合同已不是草稿，无法继续编辑。
        <a className="ml-2 underline" href={`/rentals/contracts/${contractId}`}>
          查看合同详情
        </a>
      </div>
    </main>
  );
}

export function canCreateRentalContract(permissions: readonly PermissionKey[]): boolean {
  return (
    permissions.includes("rental_contracts:create") &&
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_contracts:update")
  );
}
