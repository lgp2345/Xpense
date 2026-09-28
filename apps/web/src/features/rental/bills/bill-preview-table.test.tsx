import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BillPreviewTable } from "./bill-preview-table";
import { previewFixture } from "./bill-test-fixtures";

it("确认前可展开原付款账期的每月片段及完整参考分母", async () => {
  const item = previewFixture.items[0];
  if (!item) throw new Error("missing fixture");
  const lines = [
    {
      kind: "rent_period" as const,
      label: "二月租金",
      amountMinor: 300000,
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      referenceStart: "2026-02-01",
      referenceEnd: "2026-02-28",
      coveredDays: 28,
      referenceDays: 28,
      baseRentAmountMinor: 300000,
      sortOrder: 0,
    },
  ];
  render(
    <BillPreviewTable
      preview={{ ...previewFixture, items: [{ ...item, lines }], total: 1, createCount: 1 }}
      disabled={false}
      onPageChange={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByText("查看计算依据"));
  expect(screen.getByText("2026/02/01 至 2026/02/28")).toBeInTheDocument();
  expect(screen.getByText(/覆盖 28 天.*参考 28 天/)).toBeInTheDocument();
});
