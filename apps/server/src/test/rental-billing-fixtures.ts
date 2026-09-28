import { randomUUID } from "node:crypto";
import type { RentalBillDetail, RentalContractDetail } from "@xpense/shared";

import type { BillingDraft, BillingSource } from "../modules/rental/billing.types.js";

/** 应收测试的完整非敏感合同，默认一年季付及两项押金。 */
export function rentalBillingSource(overrides: Partial<RentalContractDetail> = {}): BillingSource {
  const contract: RentalContractDetail = {
    id: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    propertyName: "停用房产的历史合同",
    contractNumber: "RC-2026-000001",
    externalContractNumber: null,
    lifecycleStatus: "confirmed",
    displayStatus: "expired",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    actualEndDate: "2026-12-31",
    rentAmountMinor: 300000,
    tenantNames: ["租户"],
    spaceNames: ["101"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    billingAnchor: "calendar_month",
    paymentIntervalMonths: 3,
    dueDaysBefore: 0,
    hasScheduledTermination: false,
    renewedFromContractId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: null,
    spaces: [
      {
        spaceId: "00000000-0000-4000-8000-000000000003",
        spaceName: "101",
        spaceCode: null,
        spacePath: [{ id: "00000000-0000-4000-8000-000000000003", name: "101" }],
        rentAllocationMinor: null,
      },
    ],
    parties: [
      {
        tenantId: "00000000-0000-4000-8000-000000000004",
        type: "individual",
        name: "租户",
        phone: null,
        email: null,
        primaryContactName: null,
        primaryContactPhone: null,
        documentCountryCode: null,
        documentType: null,
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [
      {
        id: "00000000-0000-4000-8000-000000000005",
        type: "rental",
        customName: null,
        calculationMode: "rent_multiple",
        fixedAmountMinor: null,
        rentMultiple: "1.0000",
        finalAmountMinor: 300000,
        sortOrder: 0,
      },
      {
        id: "00000000-0000-4000-8000-000000000006",
        type: "utility",
        customName: null,
        calculationMode: "fixed_amount",
        fixedAmountMinor: 10000,
        rentMultiple: null,
        finalAmountMinor: 10000,
        sortOrder: 1,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return {
    organizationId: "org",
    currencyCode: "CNY",
    timezone: "Asia/Shanghai",
    today: "2026-12-31",
    contract,
    activeBills: [],
    terminationRecordedAt: null,
    adjustment: null,
  };
}

/** 完整账单 fixture，仅复用纯草案，不绕过对外契约。 */
export function rentalBillingDetail(source: BillingSource, draft: BillingDraft): RentalBillDetail {
  return {
    ...draft,
    id: randomUUID(),
    billNumber: "RB-2026-000001",
    contractId: source.contract.id,
    contractNumber: source.contract.contractNumber,
    propertyId: source.contract.propertyId,
    propertyName: source.contract.propertyName,
    currencyCode: source.currencyCode,
    status: "active",
    dueDate: draft.dueDate ?? "2026-01-01",
    dueState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    generationId: null,
    adjustmentId: null,
    adjustment: null,
    snapshot: {
      propertyId: source.contract.propertyId,
      propertyName: source.contract.propertyName,
      contractNumber: source.contract.contractNumber,
      spaces: source.contract.spaces,
      parties: [],
    },
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
    history: [],
  };
}
