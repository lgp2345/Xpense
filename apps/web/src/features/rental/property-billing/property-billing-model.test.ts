import { expect, it } from "vitest";
import { billFixture } from "../bills/bill-test-fixtures";
import {
  buildPropertyBillingTree,
  displayBillingDayDistance,
  propertyBillingContracts,
  propertyBillingTotals,
} from "./property-billing-model";
import { candidateFixture, unpaidBillFixture } from "./property-billing-test-fixtures";

it("无待出账期也保留历史账单、真实祖先及历史租户", () => {
  const roots = buildPropertyBillingTree([], [unpaidBillFixture], []);
  const room = roots[0]?.children[0]?.children[0];
  expect(room?.space.id).toBe("room");
  expect(room?.rows).toEqual([{ kind: "bill", unpaid: unpaidBillFixture }]);
});
it("历史账单去重排序，所有待出账行排在空间最后", () => {
  const deposit = {
    ...unpaidBillFixture,
    bill: {
      ...unpaidBillFixture.bill,
      id: "deposit",
      type: "deposit" as const,
      periodStart: null,
      periodEnd: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  };
  const roots = buildPropertyBillingTree(
    [candidateFixture],
    [unpaidBillFixture, deposit, unpaidBillFixture],
    [],
  );
  const rows = roots[0]?.children[0]?.children[0]?.rows;
  expect(rows?.map((r) => (r.kind === "bill" ? r.unpaid.bill.id : r.candidate.contractId))).toEqual(
    ["deposit", "old-bill", "contract"],
  );
});
it("生成结果仅压住原账期，保留下期候选，服务器账单优先避免重复", () => {
  const completed = [
    {
      candidate: candidateFixture,
      bill: { ...billFixture, periodStart: "2026-10-05", periodEnd: "2026-11-04" },
    },
  ];
  const next = {
    ...candidateFixture,
    period: { periodStart: "2026-11-05", periodEnd: "2026-12-04" },
  };
  const roots = buildPropertyBillingTree([candidateFixture, next], [], completed);
  const rows = roots[0]?.children[0]?.children[0]?.rows;
  expect(rows?.map((r) => r.kind)).toEqual(["bill", "candidate"]);
  expect(rows?.at(-1)).toMatchObject({ candidate: { period: next.period } });
  const serverBill = {
    ...unpaidBillFixture,
    bill: { ...billFixture, periodStart: "2026-10-05", periodEnd: "2026-11-04" },
  };
  const merged = buildPropertyBillingTree([next], [serverBill], completed);
  expect(merged[0]?.children[0]?.children[0]?.rows.filter((r) => r.kind === "bill")).toHaveLength(
    1,
  );
});
it("不同币种分别累计，重复账单只计一次，按原收费而非待收余额计算", () => {
  const otherCurrency = {
    ...unpaidBillFixture,
    bill: { ...unpaidBillFixture.bill, id: "usd", currencyCode: "USD", amountMinor: 12345 },
  };
  const roots = buildPropertyBillingTree(
    [candidateFixture],
    [unpaidBillFixture, unpaidBillFixture, otherCurrency],
    [],
  );
  expect(propertyBillingTotals(roots)).toEqual([
    { currencyCode: "CNY", amountMinor: 200000n },
    { currencyCode: "USD", amountMinor: 12345n },
  ]);
});
it("合计使用整数分，不因多个大额账单相加丢失精度", () => {
  const large = {
    ...unpaidBillFixture,
    bill: { ...unpaidBillFixture.bill, amountMinor: Number.MAX_SAFE_INTEGER },
  };
  const second = { ...large, bill: { ...large.bill, id: "second" } };
  expect(propertyBillingTotals(buildPropertyBillingTree([], [large, second], []))).toEqual([
    { currencyCode: "CNY", amountMinor: 18014398509481982n },
  ]);
});
it("零额已结清账单不作为本地未收账单回填", () => {
  const roots = buildPropertyBillingTree(
    [candidateFixture],
    [],
    [
      {
        candidate: candidateFixture,
        bill: { ...billFixture, amountMinor: 0 },
      },
    ],
  );
  expect(roots).toEqual([]);
});
it.each([
  ["2026-10-02", -16],
  ["2026-10-03", -15],
  ["2026-10-04", -14],
  ["2026-10-18", 0],
  ["2026-11-01", 14],
  ["2026-11-02", 15],
  ["2026-11-03", 16],
] as const)("日历差 %s", (start, days) =>
  expect(displayBillingDayDistance("2026-10-18", start)).toBe(days));
it("闰日、月末及夏令时按日历", () => {
  expect(displayBillingDayDistance("2028-02-28", "2028-03-01")).toBe(2);
  expect(displayBillingDayDistance("2026-03-07", "2026-03-09")).toBe(2);
  expect(displayBillingDayDistance("2026-10-31", "2026-11-02")).toBe(2);
});

it("空间行按合同汇集租户与合同号，同合同多账单和待出账只显示一次", () => {
  expect(
    propertyBillingContracts([
      { kind: "bill", unpaid: unpaidBillFixture },
      {
        kind: "bill",
        unpaid: { ...unpaidBillFixture, bill: { ...unpaidBillFixture.bill, id: "another" } },
      },
      {
        kind: "candidate",
        candidate: {
          ...candidateFixture,
          contractId: "old-contract",
          contractNumber: "RC-2026-000009",
          tenantNames: ["原租户", "共同租户"],
        },
      },
      { kind: "candidate", candidate: candidateFixture },
    ]),
  ).toEqual([
    {
      contractId: "old-contract",
      contractNumber: "RC-2026-000009",
      tenantNames: ["原租户", "共同租户"],
    },
    { contractId: "contract", contractNumber: "RC-2026-000001", tenantNames: ["张三"] },
  ]);
});
it("仅待出账时仍有合同号，同合同账单不重复展示，没有合同的祖先行为空", () => {
  expect(propertyBillingContracts([])).toEqual([]);
  expect(
    propertyBillingContracts([
      {
        kind: "candidate",
        candidate: {
          ...candidateFixture,
          contractId: "old-contract",
          contractNumber: "RC-2026-000009",
          tenantNames: ["原租户"],
        },
      },
      { kind: "bill", unpaid: unpaidBillFixture },
    ]),
  ).toEqual([
    { contractId: "old-contract", contractNumber: "RC-2026-000009", tenantNames: ["原租户"] },
  ]);
});
