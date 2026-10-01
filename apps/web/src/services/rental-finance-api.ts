import type {
  ConfirmRentalDepositReceiptRequest,
  ConfirmRentalRefundRequest,
  ConfirmRentalSettlementRequest,
  GenerateRentalMonthlyBillRequest,
  PageResult,
  PreviewRentalMonthlyBillRequest,
  PreviewRentalSettlementRequest,
  RecordRentalReceiptRequest,
  RentalBillDetail,
  RentalBillRevisionInput,
  RentalBillRevisionPreview,
  RentalCashEntry,
  RentalCashTarget,
  RentalChargeTerms,
  RentalMeterReadingInput,
  RentalMonthlyBillPreview,
  RentalSettlementDetail,
  RentalSettlementPreview,
  RevokeRentalCashRequest,
  UpdateRentalChargeTermsRequest,
  UpdateRentalMeterBaselineRequest,
} from "@xpense/shared";
import type { ApiClient, ApiRequestOptions } from "./api-client";
import type { RentalBillRevisionRecord } from "./rental-bills-api";

export type RentalFinanceRevisionRecord = RentalBillRevisionRecord;

export type RentalMeterBaseline = {
  contractId: string;
  version: string;
  readings: RentalMeterReadingInput[];
};

export type RentalCashListQuery = {
  target: RentalCashTarget;
  page?: number;
  pageSize?: number;
};

export type RentalFinanceSettlementHistoryItem = {
  id: string;
  contractId: string;
  eventId: string;
  kind: RentalSettlementDetail["kind"];
  effectiveEndDate: string;
  version: string;
  revision: number;
  finalCostMinor: number;
  balance: RentalSettlementDetail["balance"];
  status: RentalSettlementDetail["status"];
  confirmedAt: string;
  confirmedByUserId: string;
};

export type AdjustRentalBillRequest = RentalBillRevisionInput & { idempotencyKey: string };

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.size ? `?${search}` : "";
}

function targetQuery(target: RentalCashTarget, page?: number, pageSize?: number) {
  return {
    kind: target.kind,
    ...(target.kind === "bill" ? { billId: target.billId } : { settlementId: target.settlementId }),
    page: page ?? 1,
    pageSize: pageSize ?? 20,
  };
}

/** 租赁财务 HTTP 边界；金额与收费依据由服务端计算。 */
export function createRentalFinanceApi(client: ApiClient) {
  return {
    getChargeTerms: (contractId: string, options?: ApiRequestOptions) =>
      client.get<RentalChargeTerms>(
        `/rental-charges/detail${queryString({ id: contractId })}`,
        options,
      ),
    updateChargeTerms: (input: UpdateRentalChargeTermsRequest) =>
      client.post<RentalChargeTerms>("/rental-charges/update", input),
    getMeterBaseline: (contractId: string, options?: ApiRequestOptions) =>
      client.get<RentalMeterBaseline>(
        `/rental-meters/detail${queryString({ id: contractId })}`,
        options,
      ),
    updateMeterBaseline: (input: UpdateRentalMeterBaselineRequest) =>
      client.post<RentalMeterBaseline>("/rental-meters/update", input),
    previewMonthlyBill: (input: PreviewRentalMonthlyBillRequest, options?: ApiRequestOptions) =>
      client.post<RentalMonthlyBillPreview>("/rental-monthly-bills/preview", input, options),
    generateMonthlyBill: (input: GenerateRentalMonthlyBillRequest) =>
      client.post<RentalBillDetail>("/rental-monthly-bills/generate", input),
    previewBillRevision: (
      input: Omit<RentalBillRevisionInput, "idempotencyKey">,
      options?: ApiRequestOptions,
    ) =>
      client.post<RentalBillRevisionPreview>(
        "/rental-monthly-bills/adjust-preview",
        input,
        options,
      ),
    adjustBill: (input: AdjustRentalBillRequest) =>
      client.post<RentalBillRevisionPreview>("/rental-monthly-bills/adjust", input),
    recordReceipt: (input: RecordRentalReceiptRequest) =>
      client.post<RentalCashEntry>("/rental-receipts/create", input),
    confirmDepositReceipt: (input: ConfirmRentalDepositReceiptRequest) =>
      client.post<RentalCashEntry>("/rental-receipts/confirm-deposit", input),
    confirmRefund: (input: ConfirmRentalRefundRequest) =>
      client.post<RentalCashEntry>("/rental-refunds/create", input),
    revokeReceipt: (input: RevokeRentalCashRequest) =>
      client.post<RentalCashEntry>("/rental-receipts/revoke", input),
    revokeRefund: (input: RevokeRentalCashRequest) =>
      client.post<RentalCashEntry>("/rental-refunds/revoke", input),
    listCash: (input: RentalCashListQuery, options?: ApiRequestOptions) =>
      client.get<PageResult<RentalCashEntry>>(
        `/rental-cash/list${queryString(targetQuery(input.target, input.page, input.pageSize))}`,
        options,
      ),
    getSettlement: (contractId: string, options?: ApiRequestOptions) =>
      client.get<{ settlement: RentalSettlementDetail | null }>(
        `/rental-settlements/detail${queryString({ contractId })}`,
        options,
      ),
    previewSettlement: (input: PreviewRentalSettlementRequest) =>
      client.post<RentalSettlementPreview>("/rental-settlements/preview", input),
    confirmSettlement: (input: ConfirmRentalSettlementRequest) =>
      client.post<RentalSettlementDetail>("/rental-settlements/confirm", input),
    settlementHistory: (
      input: { contractId: string; page?: number; pageSize?: number },
      options?: ApiRequestOptions,
    ) =>
      client.get<PageResult<RentalFinanceSettlementHistoryItem>>(
        `/rental-settlements/history${queryString({
          contractId: input.contractId,
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 20,
        })}`,
        options,
      ),
  };
}

export type RentalFinanceApi = ReturnType<typeof createRentalFinanceApi>;

/** 一次确认持有完整请求快照；响应未知时重试仍提交同一内容与幂等键。 */
export function createRentalFinanceAttempt<TInput, TResult>(
  submit: (input: TInput) => Promise<TResult>,
  input: TInput,
) {
  const request = structuredClone(input);
  return {
    request: structuredClone(request),
    submit: () => submit(structuredClone(request)),
  };
}
