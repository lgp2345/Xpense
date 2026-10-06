import type { RentalBillDetail, RentalBillSummary, RentalCashEntry } from "@xpense/shared";
import { ApiError } from "./api-client";
import type { RentalBillsApi } from "./rental-bills-api";
import { createRentalFinanceAttempt, type RentalFinanceApi } from "./rental-finance-api";

export type RentalBillCashBatchResult = {
  billId: string;
  state: "pending" | "success" | "failed";
  outcomeUnknown?: boolean;
  entry?: RentalCashEntry;
  message?: string;
};

type BatchInput = {
  bills: readonly RentalBillSummary[];
  occurredOn: string;
  note?: string;
  amounts: Record<string, number>;
  billsApi: Pick<RentalBillsApi, "getBill">;
  financeApi: Pick<RentalFinanceApi, "recordReceipt" | "confirmDepositReceipt">;
};

type CashAttempt = { submit: () => Promise<RentalCashEntry> };

const changedSelectionMessage = "账单余额或结算状态已变化，请重新选择账单后重试。";

function validateCurrentBill(
  selected: RentalBillSummary,
  current: RentalBillDetail,
): string | undefined {
  if (
    current.id !== selected.id ||
    current.contractId !== selected.contractId ||
    current.type !== selected.type ||
    current.status !== selected.status ||
    current.currencyCode !== selected.currencyCode ||
    current.amountMinor !== selected.amountMinor ||
    current.modelVersion !== 2 ||
    selected.modelVersion !== 2 ||
    current.settlementId ||
    selected.settlementId ||
    !current.financial ||
    !selected.financial
  ) {
    return changedSelectionMessage;
  }

  if (current.financial.outstandingMinor !== selected.financial.outstandingMinor) {
    return changedSelectionMessage;
  }
  return undefined;
}

function isDefiniteRejection(cause: unknown): cause is ApiError {
  return (
    cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408
  );
}

function failureMessage(cause: unknown, mutation: boolean): string {
  if (cause instanceof ApiError) {
    if (cause.status === 409) return changedSelectionMessage;
    if (cause.status === 403) return "缺少当前收款操作权限。";
    if (cause.status >= 400 && cause.status < 500 && cause.status !== 408) return cause.message;
  }
  return mutation ? "操作结果暂未确认，重试将沿用原请求。" : "读取账单详情失败，请稍后重试。";
}

/** 按账单顺序串行读取最新合同版本，再确认每笔收款。 */
export function createRentalBillCashBatchAttempt(input: BatchInput): {
  submit: (isActive?: () => boolean) => Promise<RentalBillCashBatchResult[]>;
} {
  const snapshot = structuredClone({
    bills: input.bills,
    occurredOn: input.occurredOn,
    note: input.note,
    amounts: input.amounts,
  });
  const { billsApi, financeApi } = input;
  const results: RentalBillCashBatchResult[] = snapshot.bills.map(({ id }) => ({
    billId: id,
    state: "pending",
  }));
  const attempts = new Map<string, CashAttempt>();
  const note = snapshot.note?.trim();

  return {
    submit: async (isActive = () => true) => {
      for (const [index, selected] of snapshot.bills.entries()) {
        const result = results[index];
        if (!result || result.state === "success") continue;
        if (!isActive()) break;

        let attempt = attempts.get(selected.id);
        if (!attempt) {
          let current: RentalBillDetail;
          try {
            current = await billsApi.getBill(selected.id);
          } catch (cause) {
            if (!isActive()) break;
            result.state = "failed";
            result.message = failureMessage(cause, false);
            continue;
          }

          if (!isActive()) break;
          const validationMessage = validateCurrentBill(selected, current);
          if (validationMessage) {
            result.state = "failed";
            result.message = validationMessage;
            continue;
          }
          const currentFinancial = current.financial;
          if (!currentFinancial) {
            result.state = "failed";
            result.message = changedSelectionMessage;
            continue;
          }

          const common = {
            occurredOn: snapshot.occurredOn,
            ...(note ? { note } : {}),
            expectedVersion: currentFinancial.version,
            idempotencyKey: crypto.randomUUID(),
          };
          if (!isActive()) break;

          if (selected.type === "deposit") {
            attempt = createRentalFinanceAttempt(financeApi.confirmDepositReceipt, {
              ...common,
              billId: selected.id,
            });
          } else {
            const amountMinor = snapshot.amounts[selected.id];
            if (amountMinor === undefined) {
              result.state = "failed";
              result.message = "请重新录入该账单的收款金额。";
              continue;
            }
            attempt = createRentalFinanceAttempt(financeApi.recordReceipt, {
              ...common,
              target: { kind: "bill", billId: selected.id },
              amountMinor,
            });
          }
          attempts.set(selected.id, attempt);
        }

        if (!isActive()) break;
        try {
          result.entry = await attempt.submit();
          result.state = "success";
          delete result.message;
          delete result.outcomeUnknown;
        } catch (cause) {
          result.state = "failed";
          result.message = failureMessage(cause, true);
          result.outcomeUnknown = !isDefiniteRejection(cause);
          if (isDefiniteRejection(cause)) attempts.delete(selected.id);
        }
      }

      return results.map((result) => ({
        ...result,
        ...(result.entry ? { entry: structuredClone(result.entry) } : {}),
      }));
    },
  };
}
