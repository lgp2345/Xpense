import type { RentalPropertyBillingCandidate, RentalPropertyBillingPage } from "@xpense/shared";
export const candidateFixture: RentalPropertyBillingCandidate = {
  contractId: "contract",
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
  nextAfterContractId: null,
};
