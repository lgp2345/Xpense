import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalBillPreview, RentalBillPreviewItem } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { BillGenerationDialog } from "./bill-generation-dialog";
import { billsApiFixture, previewFixture } from "./bill-test-fixtures";

const deposits = [
  { sourceKey: "rental-deposit", label: "租赁押金", amountMinor: 100000 },
  { sourceKey: "access-deposit", label: "门禁押金", amountMinor: 5000 },
  { sourceKey: "utility-deposit", label: "水电押金", amountMinor: 30000 },
];
const depositItemBase: RentalBillPreviewItem = {
  type: "deposit",
  sourceKey: "",
  periodStart: null,
  periodEnd: null,
  effectiveEnd: null,
  dueDate: null,
  amountMinor: 0,
  lines: [],
  disposition: "create",
  existingBillId: null,
};
type DepositPreview = RentalBillPreview & { depositInputs: typeof deposits };
const depositPreview: DepositPreview = {
  ...previewFixture,
  total: 3,
  createCount: 3,
  depositInputs: deposits,
  missingDepositSourceKeys: deposits.map((item) => item.sourceKey),
  totals: { rentAmountMinor: 0, depositAmountMinor: 135000 },
  createTotals: { rentAmountMinor: 0, depositAmountMinor: 135000 },
  items: deposits.map((item) => ({
    ...depositItemBase,
    ...item,
    lines: [],
  })),
};

function openDialog(preview: DepositPreview = depositPreview) {
  const api = billsApiFixture({
    previewBills: vi.fn().mockImplementation(async (input) => ({
      ...preview,
      missingDepositSourceKeys: preview.depositInputs
        .filter((item) => !input.depositDueDates[item.sourceKey])
        .map((item) => item.sourceKey),
      canGenerate: preview.depositInputs.every((item) => input.depositDueDates[item.sourceKey]),
    })),
  });
  render(
    <BillGenerationDialog
      organizationId="org"
      contractId="contract"
      api={api}
      scope="deposits"
      open
      onOpenChange={vi.fn()}
      onGenerated={vi.fn()}
    />,
  );
  return api;
}

describe("押金账单核对与日期填写", () => {
  it("每项押金在同一处展示名称、金额和日期，不再重复展示租金账期表格", async () => {
    openDialog();
    const row = await screen.findByRole("group", { name: "租赁押金" });
    expect(within(row).getByText("1,000.00")).toBeInTheDocument();
    expect(within(row).getByRole("textbox", { name: /租赁押金.*到期日/ })).toBeInTheDocument();
    expect(screen.getAllByText("租赁押金")).toHaveLength(1);
    expect(screen.getByText("本次应收押金")).toBeInTheDocument();
    expect(screen.getByText("1,350.00")).toBeInTheDocument();
    expect(screen.getByText("还有 3 项未填写到期日")).toBeInTheDocument();
    expect(screen.queryByText("原付款账期")).not.toBeInTheDocument();
    expect(screen.queryByText(/本次新增租金/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一页" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  });

  it("批量日期有明确说明，全部填写后可单项修改并生成最新日期", async () => {
    const api = openDialog();
    const unified = await screen.findByLabelText("统一押金到期日");
    expect(screen.getByText(/会覆盖下方已填写的到期日/)).toBeInTheDocument();
    fireEvent.change(unified, { target: { value: "2026/10/15" } });
    fireEvent.blur(unified);
    await userEvent.click(screen.getByRole("button", { name: "填入全部待生成账单" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    for (const deposit of deposits) {
      expect(
        screen.getByRole("textbox", { name: new RegExp(`${deposit.label}.*到期日`) }),
      ).toHaveValue("2026/10/15");
    }
    const accessDate = screen.getByRole("textbox", { name: /门禁押金.*到期日/ });
    fireEvent.change(accessDate, { target: { value: "2026/10/20" } });
    fireEvent.blur(accessDate);
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(api.generateBills).toHaveBeenCalledWith(
      expect.objectContaining({
        depositDueDates: {
          "rental-deposit": "2026-10-15",
          "access-deposit": "2026-10-20",
          "utility-deposit": "2026-10-15",
        },
      }),
    );
  });

  it("已生成的账单单独查看，保持原金额和日期并且不参与批量填写", async () => {
    const api = openDialog({
      ...depositPreview,
      total: 4,
      existingCount: 1,
      items: [
        ...depositPreview.items,
        {
          ...depositItemBase,
          sourceKey: "existing-deposit",
          amountMinor: 6000,
          disposition: "existing",
          existingBillId: "existing-bill",
          dueDate: "2026-10-01",
        },
      ],
    });
    expect(await screen.findByText("已有 1 张账单，本次不会重复生成。")).toBeInTheDocument();
    expect(screen.getByText("新增 3 张押金账单")).toBeInTheDocument();
    await userEvent.click(screen.getByText("查看已生成账单（1）"));
    const existing = screen.getByRole("region", { name: "已生成的押金账单" });
    expect(within(existing).getByText("60.00")).toBeInTheDocument();
    expect(within(existing).getByText("2026/10/01")).toBeInTheDocument();
    expect(within(existing).queryByRole("textbox")).not.toBeInTheDocument();
    const unified = screen.getByLabelText("统一押金到期日");
    fireEvent.change(unified, { target: { value: "2026/10/15" } });
    fireEvent.blur(unified);
    await userEvent.click(screen.getByRole("button", { name: "填入全部待生成账单" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    expect(api.previewBills).toHaveBeenLastCalledWith(
      expect.objectContaining({
        depositDueDates: {
          "rental-deposit": "2026-10-15",
          "access-deposit": "2026-10-15",
          "utility-deposit": "2026-10-15",
        },
      }),
    );
  });

  it("全部已生成时明确提示，不显示日期填写区且禁止再次生成", async () => {
    openDialog({
      ...depositPreview,
      createCount: 0,
      existingCount: 3,
      depositInputs: [],
      missingDepositSourceKeys: [],
      createTotals: { rentAmountMinor: 0, depositAmountMinor: 0 },
      items: depositPreview.items.map((item) => ({ ...item, disposition: "existing" })),
    });
    expect(await screen.findByText("全部押金账单已生成")).toBeInTheDocument();
    expect(screen.queryByText(/新增.*张押金账单/)).not.toBeInTheDocument();
    expect(screen.queryByText(/本次不会重复生成/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("统一押金到期日")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  });

  it("旧响应缺少完整明细时仍能填写跨页押金并翻页核对金额", async () => {
    const api = billsApiFixture({
      previewBills: vi.fn().mockImplementation(async (input) => ({
        ...depositPreview,
        depositInputs: undefined,
        total: 3,
        page: input.page,
        pageSize: 2,
        items: (input.page === 2
          ? depositPreview.items.slice(2)
          : depositPreview.items.slice(0, 2)
        ).map((item) => ({
          ...item,
          lines: [
            {
              kind: "deposit",
              label:
                deposits.find((deposit) => deposit.sourceKey === item.sourceKey)?.label ?? "押金",
              amountMinor: item.amountMinor,
              periodStart: null,
              periodEnd: null,
              referenceStart: null,
              referenceEnd: null,
              coveredDays: null,
              referenceDays: null,
              baseRentAmountMinor: null,
              sortOrder: 0,
            },
          ],
        })),
        missingDepositSourceKeys: deposits
          .filter((item) => !input.depositDueDates[item.sourceKey])
          .map((item) => item.sourceKey),
        canGenerate: deposits.every((item) => input.depositDueDates[item.sourceKey]),
      })),
    });
    render(
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        scope="deposits"
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    const unified = await screen.findByLabelText("统一押金到期日");
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();
    expect(screen.getByText("金额需翻页核对")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    fireEvent.change(unified, { target: { value: "2026/10/15" } });
    fireEvent.blur(unified);
    await userEvent.click(screen.getByRole("button", { name: "填入全部待生成账单" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByRole("group", { name: "水电押金" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /水电押金.*到期日/ })).toHaveValue("2026/10/15");
    expect(screen.getByText("300.00")).toBeInTheDocument();
    expect(api.previewBills).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, expectedVersion: "v1" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(api.generateBills).toHaveBeenCalledWith(
      expect.objectContaining({
        depositDueDates: {
          "rental-deposit": "2026-10-15",
          "access-deposit": "2026-10-15",
          "utility-deposit": "2026-10-15",
        },
      }),
    );
  });
});
