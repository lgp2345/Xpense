import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import { BillGenerationDialog } from "./bill-generation-dialog";
import { billsApiFixture, previewFixture } from "./bill-test-fixtures";

function openDialog(api = billsApiFixture()) {
  return render(
    <StrictMode>
      <BillGenerationDialog
        organizationId="org"
        contractId="contract"
        api={api}
        scope="deposits"
        open
        onOpenChange={vi.fn()}
        onGenerated={vi.fn()}
      />
    </StrictMode>,
  );
}

describe("押金账单自动预览", () => {
  it("打开后直接展示预览，不需要更新预览按钮", async () => {
    openDialog();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText(/新增 6 张/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新预览" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  });

  it("开发模式的旧请求失败不清除新请求的加载状态或展示过期错误", async () => {
    let rejectOld: (cause: Error) => void = () => {};
    let resolveCurrent: (value: typeof previewFixture) => void = () => {};
    const api = billsApiFixture({
      previewBills: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectOld = reject;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveCurrent = resolve;
            }),
        ),
    });
    openDialog(api);
    await act(async () => rejectOld(new Error("old request failed")));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "处理中…" })).toBeDisabled();
    await act(async () => resolveCurrent(previewFixture));
    expect(screen.getByText(/新增 6 张/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("应用和修改押金到期日自动刷新，确认生成携带最新日期", async () => {
    const api = billsApiFixture();
    openDialog(api);
    const unified = await screen.findByLabelText("统一押金到期日");
    fireEvent.change(unified, { target: { value: "2026/01/01" } });
    fireEvent.blur(unified);
    await userEvent.click(screen.getByRole("button", { name: "填入全部待生成账单" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());

    const secondDate = screen.getByLabelText("押金（2）到期日");
    fireEvent.change(secondDate, { target: { value: "2026/02/01" } });
    fireEvent.blur(secondDate);
    expect(screen.getByRole("button", { name: "处理中…" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(api.generateBills).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "deposits",
        expectedVersion: "v2",
        depositDueDates: { "source-4": "2026-01-01", "source-5": "2026-02-01" },
      }),
    );
  });

  it("预览失败后可重试，成功前禁止确认生成", async () => {
    const api = billsApiFixture({ previewBills: vi.fn().mockRejectedValue(new Error("offline")) });
    openDialog(api);
    expect(await screen.findByRole("alert")).toHaveTextContent("预览失败，请重试。");
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    vi.mocked(api.previewBills).mockResolvedValue({
      ...previewFixture,
      missingDepositSourceKeys: [],
      canGenerate: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "重试预览" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试预览" })).not.toBeInTheDocument();
  });

  it("生成遇到版本冲突后可重试预览并保留押金日期", async () => {
    const api = billsApiFixture({
      generateBills: vi.fn().mockRejectedValueOnce(new ApiError(409, "CONFLICT", "预览已变化")),
    });
    openDialog(api);
    const unified = await screen.findByLabelText("统一押金到期日");
    fireEvent.change(unified, { target: { value: "2026/01/01" } });
    fireEvent.blur(unified);
    await userEvent.click(screen.getByRole("button", { name: "填入全部待生成账单" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请重新预览");
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "重试预览" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    expect(screen.getByLabelText("押金（2）到期日")).toHaveValue("2026/01/01");
  });
});
