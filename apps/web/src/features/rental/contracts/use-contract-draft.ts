import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RentalContractAvailability, RentalContractDetail } from "@xpense/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { invalidateContractMutation, rentalKeys } from "../../../services/rental-query";
import {
  type ContractChargeFormValues,
  defaultContractChargeValues,
  toContractChargeValues,
} from "../charges/contract-charge-form";
import {
  type ContractFormValues,
  contractFormSchema,
  defaultContractFormValues,
  toConfirmedContractRequest,
  toContractFormValues,
  toStepUpdateRequest,
} from "./contract-form-schema";
import {
  type ContractFieldErrors,
  type ContractValidationScope,
  contractFieldErrors,
  validateContractValues,
} from "./contract-validation-errors";

export type ContractStep = 0 | 1 | 2 | 3;
export type DraftOperation = "idle" | "loading" | "saving" | "checking" | "confirming";
export type DraftErrorKind = "load" | "save" | "availability" | "confirm";
export type DraftError = {
  kind: DraftErrorKind;
  message: string;
  status?: number;
  fieldErrors?: ContractFieldErrors;
  validationScope?: ContractValidationScope;
  focusFields?: boolean;
};

type Options = {
  api: RentalApi;
  financeApi?: RentalFinanceApi;
  canEditCharges?: boolean;
  canEditMeters?: boolean;
  canReadCharges?: boolean;
  canReadMeters?: boolean;
  organizationId: string;
  draftId?: string;
  seed?: Pick<ContractFormValues, "propertyId" | "spaces">;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  onConfirmed?: (id: string) => void;
  onNonDraft?: (detail: RentalContractDetail) => void;
};
type RequestToken = { id: number; generation: number; sessionKey: string };

export function useContractDraft(options: Options) {
  const {
    api,
    financeApi,
    canEditCharges = false,
    canEditMeters = false,
    canReadCharges = false,
    canReadMeters = false,
    organizationId,
    draftId,
    seed,
    canRead,
    canCreate,
    canUpdate,
    onConfirmed,
    onNonDraft,
  } = options;
  const queryClient = useQueryClient();
  const permissionsReady = canRead && canCreate && canUpdate;
  const contractApiReady = Boolean(
    draftId
      ? api.contractDetail && api.updateContract
      : api.createConfirmedContract && api.checkContractAvailability,
  );
  const requestReady = permissionsReady && contractApiReady;
  const permissionGate = `${canEditCharges}:${canReadCharges}:${canReadMeters}:${canRead ? "1" : "0"}${canCreate ? "1" : "0"}${canUpdate ? "1" : "0"}`;
  const routeKey = `${organizationId}:${draftId ?? "new"}:${seed?.propertyId ?? ""}:${permissionGate}:${contractApiReady ? "1" : "0"}`;
  const sessionRef = useRef(routeKey);
  const generationRef = useRef(0);
  const requestRef = useRef<RequestToken | null>(null);
  const requestSequence = useRef(0);
  const confirmedContractId = useRef<string | undefined>(undefined);
  const notifiedNonDraft = useRef<string | undefined>(undefined);
  const lastSave = useRef<{ step: ContractStep } | undefined>(undefined);
  const baseline = useRef({
    ...defaultContractFormValues(seed?.propertyId ?? ""),
    chargeSetup: canEditCharges ? defaultContractChargeValues() : null,
  });
  const baselinePropertyId = useRef<string | undefined>(undefined);
  const currentValues = useRef<ContractFormValues | null>(null);
  const editRevision = useRef(0);
  const mountedRef = useRef(false);
  if (sessionRef.current !== routeKey) {
    generationRef.current += 1;
    requestRef.current = null;
    sessionRef.current = routeKey;
    confirmedContractId.current = undefined;
  }

  const [step, setStep] = useState<ContractStep>(0);
  const [serverCharges, setServerCharges] = useState<ContractChargeFormValues | null>(null);
  const [serverDraft, setServerDraft] = useState<RentalContractDetail | null>(null);
  const [operation, setOperation] = useState<DraftOperation>("idle");
  const [error, setError] = useState<DraftError | null>(null);
  const [availability, setAvailability] = useState<{
    fingerprint: string;
    result: RentalContractAvailability;
  } | null>(null);
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [canonicalResetVersion, setCanonicalResetVersion] = useState(0);
  const [effectiveDraftId, setEffectiveDraftId] = useState<string | undefined>(draftId);

  const tokenIsCurrent = useCallback(
    (token: RequestToken) =>
      token.generation === generationRef.current &&
      token.sessionKey === sessionRef.current &&
      requestRef.current?.id === token.id,
    [],
  );
  const beginRequest = useCallback(
    (nextOperation: Exclude<DraftOperation, "idle" | "loading">): RequestToken | null => {
      if (requestRef.current) return null;
      const token = {
        id: ++requestSequence.current,
        generation: generationRef.current,
        sessionKey: sessionRef.current,
      };
      requestRef.current = token;
      setOperation(nextOperation);
      return token;
    },
    [],
  );
  const finishRequest = useCallback(
    (token: RequestToken) => {
      if (!tokenIsCurrent(token)) return false;
      requestRef.current = null;
      setOperation("idle");
      return true;
    },
    [tokenIsCurrent],
  );
  const invalidateSession = useCallback(() => {
    generationRef.current += 1;
    requestRef.current = null;
    lastSave.current = undefined;
  }, []);
  const cancelSession = useCallback(() => {
    invalidateSession();
    if (mountedRef.current) setOperation("idle");
  }, [invalidateSession]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateSession();
    };
  }, [invalidateSession]);

  const readCharges = useCallback(
    async (id: string) => {
      if (!canEditCharges || !canReadCharges) return null;
      if (!financeApi) throw new Error("收费服务暂不可用");
      const [terms, baseline] = await Promise.all([
        financeApi.getChargeTerms(id),
        canReadMeters ? financeApi.getMeterBaseline(id) : Promise.resolve(null),
      ]);
      return toContractChargeValues(terms, baseline?.readings ?? []);
    },
    [canEditCharges, canReadCharges, canReadMeters, financeApi],
  );
  const draftQuery = useQuery({
    queryKey: [
      ...rentalKeys.contractDraft(organizationId, draftId ?? "none"),
      "charges",
      permissionGate,
    ],
    queryFn: async () => {
      if (!api.contractDetail || !draftId) throw new Error("合同详情 API 不可用");
      const [detail, charges] = await Promise.all([
        api.contractDetail(draftId),
        readCharges(draftId),
      ]);
      return { detail, charges };
    },
    enabled: Boolean(requestReady && organizationId && draftId),
    retry: false,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: route key intentionally resets session state
  useEffect(() => {
    setOperation("idle");
    setEffectiveDraftId(draftId);
    setServerDraft(null);
    setServerCharges(null);
    setStep(0);
    setError(null);
    setAvailability(null);
    lastSave.current = undefined;
    notifiedNonDraft.current = undefined;
    baseline.current = {
      ...defaultContractFormValues(seed?.propertyId ?? ""),
      chargeSetup: canEditCharges ? defaultContractChargeValues() : null,
    };
    baselinePropertyId.current = undefined;
    currentValues.current = null;
    editRevision.current = 0;
    setBaselineVersion(0);
    setCanonicalResetVersion(0);
  }, [draftId, routeKey, seed?.propertyId]);

  useEffect(() => {
    const detail = draftQuery.data?.detail;
    if (!detail || !requestReady || !draftId || detail.id !== draftId) return;
    if (detail.lifecycleStatus !== "draft") {
      if (notifiedNonDraft.current !== detail.id) {
        notifiedNonDraft.current = detail.id;
        onNonDraft?.(detail);
      }
      return;
    }
    const wasDirty =
      currentValues.current !== null &&
      JSON.stringify(currentValues.current) !== JSON.stringify(baseline.current);
    setServerDraft(detail);
    setServerCharges(draftQuery.data?.charges ?? null);
    setEffectiveDraftId(detail.id);
    baseline.current = toContractFormValues(detail, draftQuery.data?.charges ?? null);
    baselinePropertyId.current = detail.propertyId;
    setBaselineVersion((version) => version + 1);
    if (!wasDirty) setStep(inferStep(detail));
    queryClient.setQueryData(rentalKeys.contractDraft(organizationId, detail.id), detail);
  }, [draftId, draftQuery.data, onNonDraft, organizationId, queryClient, requestReady]);

  useEffect(() => {
    if (draftQuery.isError && requestReady && draftId) setError(toError("load", draftQuery.error));
  }, [draftId, draftQuery.error, draftQuery.isError, requestReady]);

  const initialValues = useMemo(() => {
    if (serverDraft) return toContractFormValues(serverDraft, serverCharges);
    const values = {
      ...defaultContractFormValues(seed?.propertyId ?? ""),
      chargeSetup: canEditCharges ? defaultContractChargeValues() : null,
    };
    return seed ? { ...values, spaces: seed.spaces } : values;
  }, [canEditCharges, seed, serverDraft, serverCharges]);
  const resetBaseline = useCallback(
    (detail: RentalContractDetail, charges: ContractChargeFormValues | null = serverCharges) => {
      setServerDraft(detail);
      setServerCharges(charges);
      baseline.current = toContractFormValues(detail, charges);
      baselinePropertyId.current = detail.propertyId;
      setBaselineVersion((version) => version + 1);
      queryClient.setQueryData(
        detail.lifecycleStatus === "draft"
          ? rentalKeys.contractDraft(organizationId, detail.id)
          : rentalKeys.contract(organizationId, detail.id),
        detail,
      );
    },
    [organizationId, queryClient, serverCharges],
  );

  const save = useCallback(
    async (values: ContractFormValues, saveStep: ContractStep = step) => {
      if (!requestReady) {
        lastSave.current = undefined;
        setError({ kind: "save", message: "你没有保存合同草稿的权限。" });
        return null;
      }
      const id = effectiveDraftId;
      if (!id) return null;
      const token = beginRequest("saving");
      if (!token) return null;
      lastSave.current = { step: saveStep };
      try {
        setError(null);
        setAvailability(null);
        if (!tokenIsCurrent(token)) return null;
        const oldPropertyId = baselinePropertyId.current ?? serverDraft?.propertyId;
        const request = toStepUpdateRequest(id, values, saveStep === 3 ? 2 : saveStep);
        if (request.chargeSetup && !canEditMeters) request.chargeSetup.baselineReadings = [];
        if (!api.updateContract) return null;
        const saveRevision = editRevision.current;
        const next = await api.updateContract(request);
        if (!tokenIsCurrent(token)) return null;
        const hadConcurrentEdit = editRevision.current !== saveRevision;
        const charges = await readCharges(next.id);
        if (!tokenIsCurrent(token)) return null;
        resetBaseline(next, charges);
        if (!hadConcurrentEdit) currentValues.current = toContractFormValues(next, charges);
        if (!hadConcurrentEdit) setCanonicalResetVersion((version) => version + 1);
        await invalidateContractMutation(queryClient, organizationId, next.id, [
          oldPropertyId ?? "",
          next.propertyId,
        ]);
        finishRequest(token);
        return next;
      } catch (cause) {
        if (tokenIsCurrent(token)) {
          finishRequest(token);
          setError(toError("save", cause));
        }
        return null;
      }
    },
    [
      api,
      canEditMeters,
      beginRequest,
      effectiveDraftId,
      finishRequest,
      organizationId,
      queryClient,
      requestReady,
      resetBaseline,
      readCharges,
      serverDraft?.propertyId,
      step,
      tokenIsCurrent,
    ],
  );

  const saveAndNext = useCallback(
    async (values: ContractFormValues) => {
      if (!requestReady) return false;
      const hasDraft = Boolean(effectiveDraftId);
      const parsed = validateContractValues(values, step);
      if (!parsed.success) {
        lastSave.current = undefined;
        setError({
          kind: "save",
          message: parsed.error.issues[0]?.message ?? "请检查当前步骤。",
          fieldErrors: contractFieldErrors(parsed.error.issues),
          validationScope: step,
        });
        return false;
      }
      setError(null);
      setAvailability(null);
      if (hasDraft) {
        const result = await save(values, step);
        if (!result) return false;
      }
      setStep((current) => (current < 3 ? ((current + 1) as ContractStep) : current));
      return true;
    },
    [effectiveDraftId, requestReady, save, step],
  );

  const retrySave = useCallback(
    async (currentValues: ContractFormValues) => {
      const pending = lastSave.current;
      if (!pending || !effectiveDraftId || !requestReady) return false;
      const result = await save(currentValues, pending.step);
      if (result && pending.step < 3)
        setStep((current) => (current < 3 ? ((current + 1) as ContractStep) : current));
      return Boolean(result);
    },
    [effectiveDraftId, requestReady, save],
  );
  const canRetrySave = Boolean(lastSave.current && effectiveDraftId && requestReady);

  const checkAndConfirm = useCallback(
    async (values: ContractFormValues) => {
      if (!requestReady || !api.checkContractAvailability) {
        setError({ kind: "confirm", message: "你没有确认合同的权限。" });
        return false;
      }
      if (confirmedContractId.current) {
        onConfirmed?.(confirmedContractId.current);
        return true;
      }
      const id = effectiveDraftId;
      if (id && serverDraft?.lifecycleStatus !== "draft") {
        setError({ kind: "confirm", message: "请先保存合同草稿。" });
        return false;
      }
      let canonical = id && serverDraft ? toContractFormValues(serverDraft, serverCharges) : values;
      const isDirty = Boolean(id && JSON.stringify(values) !== JSON.stringify(baseline.current));
      const hasLegacyDeposit = Boolean(
        id &&
          serverDraft?.depositTerms.some((deposit) => deposit.calculationMode !== "fixed_amount"),
      );
      if (id && (isDirty || hasLegacyDeposit)) {
        const dirtyStep = isDirty ? inferDirtyStep(values, baseline.current) : 2;
        let saved = await save(values, dirtyStep);
        if (!saved) {
          setStep(dirtyStep);
          return false;
        }
        if (hasLegacyDeposit && dirtyStep !== 2) {
          saved = await save(values, 2);
          if (!saved) {
            setStep(2);
            return false;
          }
        }
        canonical = toContractFormValues(saved, baseline.current.chargeSetup);
      }
      const parsed = contractFormSchema.safeParse(canonical);
      if (!parsed.success) {
        lastSave.current = undefined;
        setError({
          kind: "confirm",
          message: parsed.error.issues[0]?.message ?? "请检查合同资料。",
          fieldErrors: contractFieldErrors(parsed.error.issues),
          validationScope: "contract",
        });
        setStep(inferDirtyStep(canonical, defaultContractFormValues(canonical.propertyId)));
        return false;
      }
      const checkAvailability = api.checkContractAvailability;
      const confirmContract = api.confirmContract;
      const createConfirmedContract = api.createConfirmedContract;
      const submit = id
        ? confirmContract && (() => confirmContract({ id }))
        : createConfirmedContract &&
          (() =>
            createConfirmedContract(
              toConfirmedContractRequest(
                canEditMeters || !canonical.chargeSetup
                  ? canonical
                  : {
                      ...canonical,
                      chargeSetup: {
                        ...canonical.chargeSetup,
                        waterReading: "",
                        waterReadingDate: "",
                        electricityReading: "",
                        electricityReadingDate: "",
                      },
                    },
              ),
            ));
      if (!submit) {
        setError({ kind: "confirm", message: "合同服务暂不可用，请稍后重试。" });
        return false;
      }
      const token = beginRequest("checking");
      if (!token) return false;
      try {
        setError(null);
        const fingerprint = `${canonical.propertyId}:${[...new Set(canonical.spaces.map((item) => item.spaceId))].join(",")}:${canonical.startDate}:${canonical.endDate}`;
        setAvailability(null);
        const result = await checkAvailability({
          propertyId: canonical.propertyId,
          spaceIds: canonical.spaces.map((item) => item.spaceId),
          startDate: canonical.startDate,
          endDate: canonical.endDate,
          ...(id ? { excludeContractId: id } : {}),
        });
        if (!tokenIsCurrent(token)) return false;
        setAvailability({ fingerprint, result });
        if (!result.available) {
          finishRequest(token);
          setStep(0);
          setError({
            kind: "availability",
            message: result.conflicts.length
              ? "存在空间合同冲突，请返回修改。"
              : "当前空间不可用，请返回修改。",
          });
          return false;
        }
        setOperation("confirming");
        const confirmed = await submit();
        if (!tokenIsCurrent(token)) return false;
        confirmedContractId.current = confirmed.id;
        resetBaseline(confirmed);
        if (id)
          queryClient.removeQueries({ queryKey: rentalKeys.contractDraft(organizationId, id) });
        await invalidateContractMutation(queryClient, organizationId, confirmed.id, [
          confirmed.propertyId,
        ]);
        if (!tokenIsCurrent(token)) return false;
        finishRequest(token);
        onConfirmed?.(confirmed.id);
        return true;
      } catch (cause) {
        if (tokenIsCurrent(token)) {
          finishRequest(token);
          if (isConflict(cause)) setStep(0);
          setError(toError("confirm", cause));
        }
        return false;
      }
    },
    [
      api,
      canEditMeters,
      beginRequest,
      effectiveDraftId,
      finishRequest,
      onConfirmed,
      organizationId,
      queryClient,
      requestReady,
      resetBaseline,
      save,
      serverDraft,
      serverCharges,
      tokenIsCurrent,
    ],
  );

  const retryLoad = useCallback(() => {
    if (!requestReady || !draftId) return;
    setError(null);
    void draftQuery.refetch();
  }, [draftId, draftQuery.refetch, requestReady]);
  const isDirty = useCallback((values: ContractFormValues) => {
    const previous = currentValues.current;
    if (previous === null || JSON.stringify(previous) !== JSON.stringify(values)) {
      editRevision.current += 1;
      currentValues.current = values;
    }
    return JSON.stringify(values) !== JSON.stringify(baseline.current);
  }, []);
  const revalidate = useCallback((values: ContractFormValues) => {
    setError((current) => {
      if (current?.validationScope === undefined) return current;
      const parsed = validateContractValues(values, current.validationScope);
      if (parsed.success) return null;
      return {
        ...current,
        message: parsed.error.issues[0]?.message ?? current.message,
        fieldErrors: contractFieldErrors(parsed.error.issues),
        focusFields: false,
      };
    });
  }, []);

  return {
    step,
    setStep,
    initialValues,
    serverDraft,
    draftId: effectiveDraftId,
    operation,
    error,
    availability,
    requestReady,
    isLoading:
      Boolean(requestReady && sessionRef.current !== routeKey) ||
      Boolean(requestReady && draftId && draftQuery.isPending),
    loadError: Boolean(requestReady && draftId && draftQuery.isError),
    retryLoad,
    save,
    saveAndNext,
    retrySave,
    canRetrySave,
    checkAndConfirm,
    syncBaseline: resetBaseline,
    baselineVersion,
    canonicalResetVersion,
    clearError: () => setError(null),
    revalidate,
    isDirty,
    cancelSession,
  };
}

function inferStep(detail: RentalContractDetail): ContractStep {
  if (!detail.spaces.length) return 0;
  if (!detail.parties.length || detail.parties.filter((party) => party.isPrimaryPayer).length !== 1)
    return 1;
  if (
    !detail.startDate ||
    !detail.endDate ||
    !detail.rentAmountMinor ||
    !detail.billingAnchor ||
    !detail.paymentIntervalMonths
  )
    return 2;
  return 3;
}
function inferDirtyStep(values: ContractFormValues, saved: ContractFormValues): 0 | 1 | 2 {
  if (
    values.propertyId !== saved.propertyId ||
    JSON.stringify(values.spaces) !== JSON.stringify(saved.spaces)
  )
    return 0;
  if (JSON.stringify(values.parties) !== JSON.stringify(saved.parties)) return 1;
  return 2;
}
function isConflict(cause: unknown): boolean {
  return (
    (cause instanceof ApiError && cause.status === 409) ||
    (typeof cause === "object" &&
      cause !== null &&
      "status" in cause &&
      (cause as { status?: number }).status === 409)
  );
}
function toError(kind: DraftErrorKind, cause: unknown): DraftError {
  const status = getStatus(cause);
  if (
    (kind === "confirm" || kind === "availability") &&
    cause instanceof ApiError &&
    status === 409
  ) {
    return {
      kind,
      message: cause instanceof Error ? cause.message : "操作失败，请稍后重试。",
      status,
    };
  }
  return { kind, message: "操作失败，请稍后重试。", status };
}

function getStatus(cause: unknown): number | undefined {
  if (cause instanceof ApiError) return cause.status;
  if (typeof cause === "object" && cause !== null && "status" in cause) {
    const status = (cause as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}
