import type {
  RentalPropertyBillingCandidate,
  RentalPropertyBillingPage,
  RentalPropertyUnpaidBill,
} from "@xpense/shared";
export const candidateFixture: RentalPropertyBillingCandidate = {
  contractId: "contract",
  contractNumber: "RC-2026-000001",
  spaceId: "room",
  tenantNames: ["张三"],
  period: { periodStart: "2026-10-05", periodEnd: "2026-11-04" },
  daysUntilStart: -13,
  path: [
    { id: "building", parentId: null, name: "一号楼", sortOrder: 0 },
    { id: "floor", parentId: "building", name: "三层", sortOrder: 0 },
    { id: "room", parentId: "floor", name: "301", sortOrder: 0 },
  ],
};
export const billingPageFixture: RentalPropertyBillingPage = {
  property: { id: "property", name: "示例房产" },
  today: "2026-10-18",
  timezone: "Asia/Shanghai",
  items: [candidateFixture],
  unpaidBills: [],
  nextAfterContractId: null,
};

/** 未收清账单使用历史租户；原收费 2,000 元，已收 800 元。 */
export const unpaidBillFixture = {
  spaceId: "room",
  path: candidateFixture.path,
  tenantNames: ["原租户"],
  bill: {
    id: "old-bill",
    billNumber: "RB-2026-000009",
    contractId: "old-contract",
    contractNumber: "RC-2026-000009",
    propertyId: "property",
    propertyName: "示例房产",
    currencyCode: "CNY",
    type: "period",
    status: "active",
    sourceKey: "period:2026-09-01",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    effectiveEnd: "2026-09-30",
    dueDate: "2026-09-01",
    amountMinor: 200000,
    dueState: "date_passed",
    createdAt: "2026-09-01T00:00:00.000Z",
    financial: {
      receivedMinor: 80000,
      refundedMinor: 0,
      netReceivedMinor: 80000,
      outstandingMinor: 120000,
      refundableMinor: 0,
      state: "partial",
      overdue: true,
      version: "cash-v1",
    },
  },
} satisfies RentalPropertyUnpaidBill;
