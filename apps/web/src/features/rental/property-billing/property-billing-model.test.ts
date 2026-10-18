import { expect, it } from "vitest";
import { billFixture } from "../bills/bill-test-fixtures";
import { buildPropertyBillingTree, displayBillingDayDistance } from "./property-billing-model";
import { candidateFixture } from "./property-billing-test-fixtures";

it("真实多层祖先去重，同空间多合同独立，完成结果压住刷新候选", () => {
  const next = { ...candidateFixture, contractId: "future" };
  const roots = buildPropertyBillingTree(
    [candidateFixture, next],
    [
      {
        candidate: candidateFixture,
        bill: {
          ...billFixture,
          periodStart: "2026-10-05",
          periodEnd: "2026-11-04",
          amountMinor: 0,
        },
      },
    ],
  );
  expect(roots).toHaveLength(1);
  expect(roots[0]?.space.id).toBe("building");
  const room = roots[0]?.children[0]?.children[0];
  expect(room?.rows).toHaveLength(2);
  expect(room?.rows.find((r) => r.candidate.contractId === "contract")?.bill?.amountMinor).toBe(0);
});
it("没有候选的分支消失，已生成末期仍保留全部祖先，兄弟顺序稳定", () => {
  expect(buildPropertyBillingTree([], [])).toEqual([]);
  const completed = buildPropertyBillingTree(
    [],
    [{ candidate: candidateFixture, bill: billFixture }],
  );
  expect(completed[0]?.children[0]?.children[0]?.rows).toHaveLength(1);
  const other = {
    ...candidateFixture,
    contractId: "other",
    path: [{ id: "second", parentId: null, name: "二号楼", sortOrder: -1 }],
  };
  expect(buildPropertyBillingTree([candidateFixture, other], []).map((n) => n.space.id)).toEqual([
    "second",
    "building",
  ]);
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
