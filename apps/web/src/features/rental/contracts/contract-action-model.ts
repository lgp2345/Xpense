import type { PermissionKey, RentalContractDetail, RentalContractPartyInput } from "@xpense/shared";

import { ApiError } from "../../../services/api-client";

export type ActionKind = "delete" | "cancel" | "changeParties" | "terminate" | "revoke" | "renew";
export type DialogTarget = {
  contextKey: string;
  organizationId: string;
  contractId: string;
  propertyId: string;
};
export type DialogState =
  | { tag: "closed" }
  | { tag: "open"; kind: "delete"; target: DialogTarget; submitError: string | null }
  | { tag: "open"; kind: "renew"; target: DialogTarget; submitError: string | null }
  | {
      tag: "open";
      kind: "cancel";
      target: DialogTarget;
      reason: string;
      fieldErrors: { reason?: string };
      submitError: string | null;
    }
  | {
      tag: "open";
      kind: "revoke";
      target: DialogTarget;
      reason: string;
      fieldErrors: { reason?: string };
      submitError: string | null;
    }
  | {
      tag: "open";
      kind: "terminate";
      target: DialogTarget;
      terminationDate: string;
      reason: string;
      fieldErrors: { terminationDate?: string; reason?: string };
      submitError: string | null;
    }
  | {
      tag: "open";
      kind: "changeParties";
      target: DialogTarget;
      effectiveDate: string;
      reason: string;
      parties: RentalContractPartyInput[];
      rowIds: string[];
      fieldErrors: { effectiveDate?: string; reason?: string; parties?: string };
      submitError: string | null;
    };

export const ACTION_LABELS: Record<ActionKind, string> = {
  delete: "删除草稿",
  cancel: "取消合同",
  changeParties: "变更承租方",
  terminate: "提前终止",
  revoke: "撤销预定终止",
  renew: "创建续租草稿",
};
export const ACTION_TITLES: Record<ActionKind, string> = {
  delete: "删除合同草稿",
  cancel: "取消合同",
  changeParties: "变更承租方",
  terminate: "提前终止合同",
  revoke: "撤销预定终止",
  renew: "创建续租草稿",
};

export function getAvailableActions(
  contract: RentalContractDetail,
  permissions: readonly PermissionKey[],
): ActionKind[] {
  const canUpdate = permissions.includes("rental_contracts:update");
  const canDelete = permissions.includes("rental_contracts:delete");
  const actions: ActionKind[] = [];
  if (canDelete && contract.lifecycleStatus === "draft") actions.push("delete");
  if (
    canUpdate &&
    contract.lifecycleStatus === "confirmed" &&
    contract.displayStatus === "upcoming"
  )
    actions.push("cancel");
  if (
    canUpdate &&
    contract.lifecycleStatus === "confirmed" &&
    ["active", "expiring_soon"].includes(contract.displayStatus)
  ) {
    actions.push("changeParties");
    if (!contract.hasScheduledTermination) actions.push("terminate");
  }
  if (canUpdate && contract.lifecycleStatus === "confirmed" && contract.hasScheduledTermination)
    actions.push("revoke");
  if (
    canUpdate &&
    (contract.lifecycleStatus === "terminated" ||
      (contract.lifecycleStatus === "confirmed" &&
        ["active", "expiring_soon", "expired"].includes(contract.displayStatus)))
  )
    actions.push("renew");
  return actions;
}

export function validateDialog(
  state: Exclude<DialogState, { tag: "closed" }>,
): Record<string, string> | null {
  if (state.kind === "delete" || state.kind === "renew") return null;
  const errors: Record<string, string> = {};
  if (!state.reason.trim()) errors.reason = "请输入原因。";
  if (state.kind === "terminate" && !isCalendarDate(state.terminationDate))
    errors.terminationDate = "请输入有效的日期。";
  if (state.kind === "changeParties") {
    if (!isCalendarDate(state.effectiveDate)) errors.effectiveDate = "请输入有效的日期。";
    if (state.parties.length === 0) errors.parties = "至少需要一名承租方。";
    const ids = state.parties.map((party) => party.tenantId.trim());
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
      errors.parties = "承租方不能重复或为空。";
    if (state.parties.filter((party) => party.isPrimaryPayer).length !== 1)
      errors.parties = "必须恰好指定一名主付款人。";
  }
  return Object.keys(errors).length ? errors : null;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return error.message;
  if (error instanceof ApiError && error.status === 403) return "你没有执行此操作的权限。";
  if (error instanceof ApiError && error.status === 404) return "合同不存在或已删除。";
  if (!(error instanceof ApiError)) return "网络异常，请检查连接后重试。";
  return "合同操作失败，请稍后重试。";
}
