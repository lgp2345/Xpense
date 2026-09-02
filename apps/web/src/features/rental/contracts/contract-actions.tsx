import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type {
  ChangeRentalContractPartiesRequest,
  PermissionKey,
  RentalContractDetail,
} from "@xpense/shared";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import {
  invalidateContractMutation,
  invalidateDeletedContractMutation,
} from "../../../services/rental-query";
import {
  ACTION_LABELS,
  ACTION_TITLES,
  type ActionKind,
  actionErrorMessage,
  type DialogState,
  type DialogTarget,
  getAvailableActions,
  validateDialog,
} from "./contract-action-model";

export function ContractActions({
  api,
  organizationId,
  contract,
  permissions,
  search,
  navigate,
}: {
  api: RentalApi;
  organizationId: string;
  contract: RentalContractDetail;
  permissions: readonly PermissionKey[];
  search?: Record<string, unknown>;
  navigate?: UseNavigateResult<"/rentals/contracts/$contractId">;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>({ tag: "closed" });
  const contextKey = `${organizationId}:${contract.id}`;
  const liveContextRef = useRef(contextKey);
  liveContextRef.current = contextKey;
  const currentTarget = (): DialogTarget => ({
    contextKey,
    organizationId,
    contractId: contract.id,
    propertyId: contract.propertyId,
  });
  const commonSuccess = async (result: RentalContractDetail, target: DialogTarget) => {
    await invalidateContractMutation(queryClient, target.organizationId, target.contractId, [
      target.propertyId,
      result.propertyId,
    ]);
  };
  const cancel = useMutation({
    mutationFn: (variables: { input: { id: string; reason: string }; target: DialogTarget }) =>
      api.cancelContract?.(variables.input) ?? Promise.reject(new Error("取消合同不可用")),
    onSuccess: (result, variables) => commonSuccess(result, variables.target),
  });
  const changeParties = useMutation({
    mutationFn: (variables: { input: ChangeRentalContractPartiesRequest; target: DialogTarget }) =>
      api.changeContractParties?.(variables.input) ?? Promise.reject(new Error("变更承租方不可用")),
    onSuccess: (result, variables) => commonSuccess(result, variables.target),
  });
  const terminate = useMutation({
    mutationFn: (variables: {
      input: { id: string; terminationDate: string; reason: string };
      target: DialogTarget;
    }) => api.terminateContract?.(variables.input) ?? Promise.reject(new Error("终止合同不可用")),
    onSuccess: (result, variables) => commonSuccess(result, variables.target),
  });
  const revoke = useMutation({
    mutationFn: (variables: { input: { id: string; reason: string }; target: DialogTarget }) =>
      api.revokeContractTermination?.(variables.input) ??
      Promise.reject(new Error("撤销终止不可用")),
    onSuccess: (result, variables) => commonSuccess(result, variables.target),
  });
  const renew = useMutation({
    mutationFn: (variables: { input: { id: string }; target: DialogTarget }) =>
      api.renewContract?.(variables.input) ?? Promise.reject(new Error("续租不可用")),
    onSuccess: async (result, variables) => {
      await commonSuccess(result, variables.target);
      await invalidateContractMutation(queryClient, variables.target.organizationId, result.id, [
        variables.target.propertyId,
        result.propertyId,
      ]);
      if (liveContextRef.current !== variables.target.contextKey) return;
      void navigate?.({
        to: "/rentals/contracts/$contractId",
        params: { contractId: result.id },
        replace: true,
      });
    },
  });
  const remove = useMutation({
    mutationFn: (variables: { input: { id: string }; target: DialogTarget }) =>
      api.deleteContract?.(variables.input) ?? Promise.reject(new Error("删除草稿不可用")),
    onSuccess: async (_, variables) => {
      await invalidateDeletedContractMutation(
        queryClient,
        variables.target.organizationId,
        variables.target.contractId,
        [variables.target.propertyId],
      );
      if (liveContextRef.current !== variables.target.contextKey) return;
      void navigate?.({
        to: "/rentals/contracts" as never,
        search: search as never,
        replace: true,
      });
    },
  });
  const pending =
    cancel.isPending ||
    changeParties.isPending ||
    terminate.isPending ||
    revoke.isPending ||
    renew.isPending ||
    remove.isPending;
  const open = (kind: ActionKind) => {
    if (pending) return;
    const target = currentTarget();
    if (kind === "delete" || kind === "renew")
      setDialog({ tag: "open", kind, target, submitError: null });
    else if (kind === "terminate")
      setDialog({
        tag: "open",
        kind,
        target,
        terminationDate: "",
        reason: "",
        fieldErrors: {},
        submitError: null,
      });
    else if (kind === "changeParties")
      setDialog({
        tag: "open",
        kind,
        target,
        effectiveDate: "",
        reason: "",
        parties: contract.parties
          .filter((party) => party.validTo === null)
          .map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer })),
        rowIds: contract.parties
          .filter((party) => party.validTo === null)
          .map((party, index) => `party-row-${index}-${party.tenantId}`),
        fieldErrors: {},
        submitError: null,
      });
    else setDialog({ tag: "open", kind, target, reason: "", fieldErrors: {}, submitError: null });
  };
  const close = () => {
    if (!pending) setDialog({ tag: "closed" });
  };
  const update = (next: Partial<Extract<DialogState, { tag: "open" }>>) =>
    setDialog((current) =>
      current.tag === "open" ? ({ ...current, ...next } as DialogState) : current,
    );
  const submit = async () => {
    if (dialog.tag !== "open" || pending) return;
    const state = dialog;
    if (state.target.contextKey !== contextKey) {
      update({ submitError: "当前合同上下文已变化，请关闭后重试。" });
      return;
    }
    if (!getAvailableActions(contract, permissions).includes(state.kind)) {
      update({ submitError: "当前权限或合同状态已变化，请关闭后刷新页面。" });
      return;
    }
    const validation = validateDialog(state);
    if (validation) {
      update({ fieldErrors: validation });
      focusFirstError(state.kind, validation);
      return;
    }
    try {
      if (state.kind === "delete")
        await remove.mutateAsync({ input: { id: state.target.contractId }, target: state.target });
      else if (state.kind === "renew")
        await renew.mutateAsync({ input: { id: state.target.contractId }, target: state.target });
      else if (state.kind === "cancel")
        await cancel.mutateAsync({
          input: { id: state.target.contractId, reason: state.reason.trim() },
          target: state.target,
        });
      else if (state.kind === "revoke")
        await revoke.mutateAsync({
          input: { id: state.target.contractId, reason: state.reason.trim() },
          target: state.target,
        });
      else if (state.kind === "terminate")
        await terminate.mutateAsync({
          input: {
            id: state.target.contractId,
            terminationDate: state.terminationDate,
            reason: state.reason.trim(),
          },
          target: state.target,
        });
      else
        await changeParties.mutateAsync({
          input: {
            id: state.target.contractId,
            effectiveDate: state.effectiveDate,
            reason: state.reason.trim(),
            parties: state.parties,
          },
          target: state.target,
        });
      if (liveContextRef.current === state.target.contextKey) setDialog({ tag: "closed" });
    } catch (error) {
      const message = actionErrorMessage(error);
      if (error instanceof ApiError && error.status === 409) toast.error(message);
      if (error instanceof ApiError && error.status === 404)
        await invalidateDeletedContractMutation(
          queryClient,
          state.target.organizationId,
          state.target.contractId,
          [state.target.propertyId],
        );
      if (liveContextRef.current === state.target.contextKey) update({ submitError: message });
    }
  };
  const actions = getAvailableActions(contract, permissions);
  return (
    <section aria-label="合同操作" className="flex flex-wrap gap-2">
      {actions.map((kind) => (
        <Button
          key={kind}
          variant={kind === "delete" ? "destructive" : "outline"}
          disabled={pending}
          onClick={() => open(kind)}
        >
          {ACTION_LABELS[kind]}
        </Button>
      ))}
      <Dialog
        open={dialog.tag === "open"}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.tag === "open" ? ACTION_TITLES[dialog.kind] : "合同操作"}
            </DialogTitle>
            <DialogDescription>
              请确认操作并填写必要信息，最终结果以服务端校验为准。
            </DialogDescription>
          </DialogHeader>
          {dialog.tag === "open" && dialog.kind !== "delete" && dialog.kind !== "renew" ? (
            <ActionFields state={dialog} onChange={update} />
          ) : null}
          {dialog.tag === "open" && dialog.submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {dialog.submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              取消
            </Button>
            <Button
              variant={
                dialog.tag === "open" && dialog.kind === "delete" ? "destructive" : "default"
              }
              disabled={pending}
              onClick={() => void submit()}
            >
              {dialog.tag === "open" ? `确认${ACTION_LABELS[dialog.kind]}` : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type ActionFieldsState = Extract<
  DialogState,
  { tag: "open"; kind: "cancel" | "revoke" | "terminate" | "changeParties" }
>;

function ActionFields({
  state,
  onChange,
}: {
  state: ActionFieldsState;
  onChange: (next: Partial<Extract<DialogState, { tag: "open" }>>) => void;
}) {
  if (state.kind === "terminate")
    return (
      <div className="space-y-3">
        <Field
          label="终止日期"
          error={state.fieldErrors.terminationDate}
          errorId="contract-action-termination-date-error"
        >
          <Input
            id="contract-action-termination-date"
            aria-label="终止日期"
            aria-invalid={Boolean(state.fieldErrors.terminationDate)}
            aria-describedby={
              state.fieldErrors.terminationDate
                ? "contract-action-termination-date-error"
                : undefined
            }
            type="date"
            value={state.terminationDate}
            onChange={(event) => onChange({ terminationDate: event.target.value })}
          />
        </Field>
        <ReasonField
          value={state.reason}
          error={state.fieldErrors.reason}
          onChange={(reason) => onChange({ reason })}
        />
      </div>
    );
  if (state.kind === "changeParties")
    return (
      <div className="space-y-3">
        <Field
          label="生效日期"
          error={state.fieldErrors.effectiveDate}
          errorId="contract-action-effective-date-error"
        >
          <Input
            id="contract-action-effective-date"
            aria-label="生效日期"
            aria-invalid={Boolean(state.fieldErrors.effectiveDate)}
            aria-describedby={
              state.fieldErrors.effectiveDate ? "contract-action-effective-date-error" : undefined
            }
            type="date"
            value={state.effectiveDate}
            onChange={(event) => onChange({ effectiveDate: event.target.value })}
          />
        </Field>
        <ReasonField
          value={state.reason}
          error={state.fieldErrors.reason}
          onChange={(reason) => onChange({ reason })}
        />
        <div id="contract-action-parties" tabIndex={-1}>
          <span className="text-sm font-medium">承租方</span>
          {state.parties.map((party, index) => (
            <div className="mt-2 flex gap-2" key={state.rowIds[index]}>
              <Input
                aria-label={`承租方 ${index + 1}`}
                aria-invalid={Boolean(state.fieldErrors.parties)}
                aria-describedby={
                  state.fieldErrors.parties ? "contract-action-parties-error" : undefined
                }
                value={party.tenantId}
                onChange={(event) => {
                  const parties = [...state.parties];
                  parties[index] = { ...party, tenantId: event.target.value };
                  onChange({ parties });
                }}
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="primary-payer"
                  checked={party.isPrimaryPayer}
                  onChange={() =>
                    onChange({
                      parties: state.parties.map((item, itemIndex) => ({
                        ...item,
                        isPrimaryPayer: itemIndex === index,
                      })),
                    })
                  }
                />
                主付款人
              </label>
            </div>
          ))}
        </div>
        {state.fieldErrors.parties ? (
          <p id="contract-action-parties-error" role="alert" className="text-sm text-destructive">
            {state.fieldErrors.parties}
          </p>
        ) : null}
      </div>
    );
  return (
    <ReasonField
      value={state.reason}
      error={state.fieldErrors.reason}
      onChange={(reason) => onChange({ reason })}
    />
  );
}

function ReasonField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="原因" error={error} errorId="contract-action-reason-error">
      <textarea
        id="contract-action-reason"
        aria-label="原因"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "contract-action-reason-error" : undefined}
        className="min-h-20 w-full rounded-md border bg-transparent p-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
function Field({
  label,
  error,
  errorId,
  children,
}: {
  label: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block space-y-1 text-sm">
      <span>{label}</span>
      {children}
      {error ? (
        <span id={errorId} role="alert" className="block text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function focusFirstError(kind: ActionKind, errors: Record<string, string>) {
  const id =
    kind === "terminate" && errors.terminationDate
      ? "contract-action-termination-date"
      : kind === "changeParties" && errors.effectiveDate
        ? "contract-action-effective-date"
        : errors.reason
          ? "contract-action-reason"
          : errors.parties
            ? "contract-action-parties"
            : undefined;
  if (id) document.getElementById(id)?.focus();
}
