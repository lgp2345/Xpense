import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import { BillGenerationDialog } from "./bill-generation-dialog";
import { billsApiFixture, previewFixture } from "./bill-test-fixtures";

async function dates() {
  const input = await screen.findByLabelText("统一押金到期日");
  fireEvent.change(input, { target: { value: "2026/01/01" } });
  fireEvent.blur(input);
  await userEvent.click(screen.getByRole("button", { name: "应用到新增押金" }));
  await userEvent.click(screen.getByRole("button", { name: "更新预览" }));
}
describe("完整计划确认", () => {
  it("当前页仅有租金时也能填写所有押金，预览通过后仍可修改各项日期", async () => {
    const api = billsApiFixture({
      previewBills: vi.fn().mockImplementation(async (input) => ({
        ...previewFixture,
        items: previewFixture.items.filter((item) => item.type === "rent"),
        depositInputs: [
          { sourceKey: "source-4", label: "租赁押金", amountMinor: 150000 },
          { sourceKey: "source-5", label: "水电押金", amountMinor: 150000 },
        ],
        missingDepositSourceKeys: ["source-4", "source-5"].filter(
          (key) => !input.depositDueDates[key],
        ),
        canGenerate: ["source-4", "source-5"].every((key) => input.depositDueDates[key]),
      })),
    });
    render(
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText(/租赁押金.*到期日/)).toBeInTheDocument();
    await dates();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled();
    const utilityDate = screen.getByLabelText(/水电押金.*到期日/);
    fireEvent.change(utilityDate, { target: { value: "2026/02/01" } });
    fireEvent.blur(utilityDate);
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "更新预览" }));
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(api.generateBills).toHaveBeenCalledWith(
      expect.objectContaining({
        depositDueDates: { "source-4": "2026-01-01", "source-5": "2026-02-01" },
      }),
    );
  });
  it("新增押金日期标明实际费用名称，避免把日期填给另一项", async () => {
    const api = billsApiFixture({
      previewBills: vi.fn().mockResolvedValue({
        ...previewFixture,
        items: previewFixture.items.map((item, index) => ({
          ...item,
          lines:
            item.type === "deposit"
              ? [
                  {
                    kind: "deposit",
                    label: index === 4 ? "租赁押金" : "水电押金",
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
                ]
              : item.lines,
        })),
      }),
    });
    render(
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText(/租赁押金.*到期日/)).toBeInTheDocument();
    expect(screen.getByLabelText(/水电押金.*到期日/)).toBeInTheDocument();
  });
  it("分页维持全计划汇总并携带版本；请求进行中连点只提交一次", async () => {
    const api = billsApiFixture({
      previewBills: vi.fn().mockResolvedValue({
        ...previewFixture,
        total: 101,
        createCount: 101,
        missingDepositSourceKeys: [],
        canGenerate: true,
      }),
    });
    let finish: (value: Awaited<ReturnType<typeof api.generateBills>>) => void = () => {};
    vi.mocked(api.generateBills).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onGenerated = vi.fn();
    render(
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={onGenerated}
      />,
    );
    expect(await screen.findByText(/新增 101 张/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(api.previewBills).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, expectedVersion: "v1" }),
    );
    const button = screen.getByRole("button", { name: "确认生成" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.generateBills).toHaveBeenCalledOnce();
    finish({
      generationId: "batch",
      createdCount: 101,
      existingCount: 0,
      totals: previewFixture.totals,
      replayed: false,
    });
    await waitFor(() => expect(onGenerated).toHaveBeenCalledOnce());
  });
  it("日期齐全才确认；丢失响应后使用原键重试，连点不能重复发起", async () => {
    const api = billsApiFixture();
    vi.mocked(api.generateBills).mockRejectedValueOnce(new Error("response lost"));
    const onGenerated = vi.fn();
    render(
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={onGenerated}
      />,
    );
    expect(await screen.findByText(/新增 6 张/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    await dates();
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(await screen.findByRole("button", { name: "重试原请求" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "重试原请求" }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledOnce());
    expect(vi.mocked(api.generateBills).mock.calls[0]?.[0]).toEqual(
      vi.mocked(api.generateBills).mock.calls[1]?.[0],
    );
    expect(vi.mocked(api.generateBills).mock.calls[0]?.[0]).not.toHaveProperty("page");
  });
  it("409 禁止原确认，重新预览按 sourceKey 保留日期", async () => {
    const api = billsApiFixture();
    vi.mocked(api.generateBills).mockRejectedValueOnce(new ApiError(409, "CONFLICT", "预览已变化"));
    render(
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    await dates();
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(await screen.findByText(/请重新预览/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "更新预览" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  });
  it("组织切换丢弃迟到预览", async () => {
    let resolve: (value: typeof previewFixture) => void = () => {};
    const api = billsApiFixture({
      previewBills: vi
        .fn()
        .mockReturnValueOnce(
          new Promise((resolvePromise) => {
            resolve = resolvePromise;
          }),
        )
        .mockResolvedValue({ ...previewFixture, createCount: 1 }),
    });
    const view = render(
      <BillGenerationDialog
        organizationId="a"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    view.rerender(
      <BillGenerationDialog
        organizationId="b"
        contractId="contract"
        api={api}
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />,
    );
    resolve(previewFixture);
    expect(await screen.findByText(/新增 1 张/)).toBeInTheDocument();
    expect(screen.queryByText(/新增 6 张/)).not.toBeInTheDocument();
  });
});
