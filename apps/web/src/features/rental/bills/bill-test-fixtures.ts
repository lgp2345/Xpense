import type { RentalBillDetail, RentalBillPreview, RentalChargeTerms } from "@xpense/shared";
import { vi } from "vitest";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import type { RentalFinanceApi, RentalMeterBaseline } from "../../../services/rental-finance-api";

export const chargeTermsFixture: RentalChargeTerms = {
  contractId: "contract",
  version: "charges-v1",
  waterCollectionEnabled: true,
  electricityCollectionEnabled: true,
  waterUnitPrice: "3.0000",
  electricityUnitPrice: "4.0000",
  fixedFees: [
    { id: "11111111-1111-4111-8111-111111111111", name: "物业费", periodAmountMinor: 50000 },
  ],
};

export const meterBaselineFixture: RentalMeterBaseline = {
  contractId: "contract",
  version: "meters-v1",
  readings: [
    { kind: "water", reading: "100" },
    { kind: "electricity", reading: "250" },
  ],
};

export function financeApiFixture(overrides: Partial<RentalFinanceApi> = {}): RentalFinanceApi {
  return {
    listPropertyBilling: vi.fn().mockResolvedValue({
      property: { id: "property", name: "房产" },
      today: "2026-10-18",
      timezone: "Asia/Shanghai",
      items: [],
      nextAfterContractId: null,
    }),
    getChargeTerms: vi.fn().mockResolvedValue(chargeTermsFixture),
    updateChargeTerms: vi.fn().mockResolvedValue(chargeTermsFixture),
    getMeterBaseline: vi.fn().mockResolvedValue(meterBaselineFixture),
    updateMeterBaseline: vi.fn().mockResolvedValue(meterBaselineFixture),
    getPeriodBillContext: vi.fn().mockResolvedValue(periodContextFixture),
    previewPeriodBill: vi.fn().mockImplementation(async (input) => ({
      version: "preview-v1",
      period: { periodStart: input.periodStart, periodEnd: "2026-11-04" },
      dueDate: input.dueDate,
      defaults: chargeTermsFixture,
      baselineReadings: periodContextFixture.baselineReadings,
      defaultReadings: periodContextFixture.defaultReadings,
      lines: [],
      amountMinor: 300000,
      canConfirm: true,
      missingFields: [],
    })),
    generatePeriodBill: vi.fn().mockResolvedValue(billFixture),
    voidPeriodBill: vi.fn().mockResolvedValue({ ...billFixture, status: "voided" }),
    recordReceipt: vi.fn().mockResolvedValue({}),
    confirmDepositReceipt: vi.fn().mockResolvedValue({}),
    confirmRefund: vi.fn().mockResolvedValue({}),
    revokeReceipt: vi.fn().mockResolvedValue({}),
    revokeRefund: vi.fn().mockResolvedValue({}),
    listCash: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getSettlement: vi.fn().mockResolvedValue({ settlement: null }),
    previewSettlement: vi.fn().mockResolvedValue({}),
    confirmSettlement: vi.fn().mockResolvedValue({}),
    settlementHistory: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    ...overrides,
  } as unknown as RentalFinanceApi;
}
export const previewFixture: RentalBillPreview = {
  items: Array.from({ length: 6 }, (_, index) => ({
    type: index < 4 ? "period" : "deposit",
    sourceKey: `source-${index}`,
    periodStart: index < 4 ? "2026-01-01" : null,
    periodEnd: index < 4 ? "2026-03-31" : null,
    effectiveEnd: index < 4 ? "2026-03-31" : null,
    dueDate: index < 4 ? "2026-01-01" : null,
    amountMinor: index < 4 ? 900000 : 150000,
    lines: [],
    disposition: "create",
    existingBillId: null,
  })),
  total: 6,
  page: 1,
  pageSize: 20,
  version: "v1",
  canGenerate: false,
  createCount: 6,
  existingCount: 0,
  totals: { rentAmountMinor: 3600000, depositAmountMinor: 300000 },
  createTotals: { rentAmountMinor: 3600000, depositAmountMinor: 300000 },
  missingDepositSourceKeys: ["source-4", "source-5"],
  terminationReference: null,
};
export const billFixture: RentalBillDetail = {
  id: "bill",
  billNumber: "RB-2026-000001",
  contractId: "contract",
  contractNumber: "RC-2026-000001",
  propertyId: "property",
  propertyName: "生成时房产",
  currencyCode: "CNY",
  type: "period",
  status: "active",
  sourceKey: "rent:2026-01-01:2026-03-31",
  periodStart: "2026-01-01",
  periodEnd: "2026-03-31",
  effectiveEnd: "2026-03-31",
  dueDate: "2026-01-01",
  amountMinor: 900000,
  dueState: "date_passed",
  createdAt: "2026-01-01T00:00:00.000Z",
  lines: [],
  generationId: "batch",
  adjustmentId: null,
  adjustment: null,
  snapshot: {
    propertyId: "property",
    propertyName: "生成时房产",
    contractNumber: "RC-2026-000001",
    spaces: [],
    parties: [],
  },
  voidReason: null,
  voidedAt: null,
  voidedBy: null,
  history: [],
  version: "bill-v1",
  canVoid: true,
  voidBlockedReason: null,
};
export function billsApiFixture(overrides: Partial<RentalBillsApi> = {}): RentalBillsApi {
  return {
    listBills: vi.fn().mockResolvedValue({
      items: [billFixture],
      total: 1,
      page: 1,
      pageSize: 20,
      totals: { rentAmountMinor: 900000, depositAmountMinor: 0 },
      coverage: {
        existingRentCount: 1,
        existingDepositCount: 0,
        missingRentCount: 3,
        missingDepositCount: 2,
      },
    }),
    getBill: vi.fn().mockResolvedValue(billFixture),
    previewBills: vi.fn().mockImplementation(async (input) => ({
      ...structuredClone(previewFixture),
      canGenerate: previewFixture.missingDepositSourceKeys.every(
        (key) => input.depositDueDates[key],
      ),
      version: Object.keys(input.depositDueDates).length ? "v2" : "v1",
    })),
    generateBills: vi.fn().mockResolvedValue({
      generationId: "batch",
      createdCount: 6,
      existingCount: 0,
      totals: previewFixture.createTotals,
      replayed: false,
    }),
    ...overrides,
  };
}

export const periodContextFixture: import("@xpense/shared").RentalPeriodBillContext = {
  version: "context-v1",
  billingStart: null,
  canSelectBillingStart: true,
  nextPeriod: { periodStart: "2026-10-05", periodEnd: "2026-11-04" },
  defaultDueDate: "2026-10-05",
  defaults: chargeTermsFixture,
  baselineReadings: [
    { kind: "water", reading: "3500" },
    { kind: "electricity", reading: "50" },
  ],
  defaultReadings: [
    { kind: "water", reading: "3500" },
    { kind: "electricity", reading: "50" },
  ],
  selectablePeriods: {
    items: [
      { periodStart: "2026-10-05", periodEnd: "2026-11-04" },
      { periodStart: "2026-11-05", periodEnd: "2026-12-04" },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
  },
  missingFields: [],
};
