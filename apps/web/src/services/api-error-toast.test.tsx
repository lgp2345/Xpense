import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/context/theme-provider";
import { toast } from "@/lib/toast";
import { ApiError } from "./api-client";
import { showApiErrorToast } from "./api-error-toast";

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  return render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>,
  );
}

describe("公共 Toast", () => {
  it("shows success and plain error messages through the same entry", async () => {
    mount();
    act(() => {
      toast.success("保存成功");
      toast.error("请选择一个账户");
    });
    expect(await screen.findByText("保存成功")).toBeInTheDocument();
    expect(await screen.findByText("请选择一个账户")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制错误编号" })).not.toBeInTheDocument();
  });

  it("preserves Error messages and uses fallbacks only when no message exists", async () => {
    mount();
    act(() => {
      toast.error(new Error("private detail"), "保存失败");
      toast.error(null);
    });
    expect(await screen.findByText("private detail")).toBeInTheDocument();
    expect(await screen.findByText("操作失败，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByText("保存失败")).not.toBeInTheDocument();
  });

  it("copies the server id and only changes the button label while retaining the error", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { container } = mount();
    const error = new ApiError(500, "INTERNAL_ERROR", "private detail", undefined, "req-copy");
    act(() => {
      toast.error(error);
      showApiErrorToast(error, "保存失败");
    });
    const copy = await screen.findByRole("button", { name: "复制错误编号" });
    expect(screen.getAllByRole("button", { name: "复制错误编号" })).toHaveLength(1);
    expect(screen.getByText("private detail")).toBeInTheDocument();
    expect(container.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-x-position",
      "center",
    );
    expect(container.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-y-position",
      "top",
    );
    const notification = copy.closest("[data-sonner-toast]");
    const icon = notification?.querySelector("[data-icon]")?.innerHTML;
    await user.click(copy);
    expect(writeText).toHaveBeenCalledExactlyOnceWith("req-copy");
    const copied = await screen.findByRole("button", { name: "编码已复制" });
    expect(screen.getByText("private detail")).toBeInTheDocument();
    expect(screen.getByText("错误编号：req-copy")).toBeInTheDocument();
    expect(notification).toHaveAttribute("data-type", "error");
    expect(notification?.querySelector("[data-icon]")?.innerHTML).toBe(icon);
    expect(screen.queryByText("错误编号已复制")).not.toBeInTheDocument();
    await user.click(copied);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(screen.getByText("private detail")).toBeInTheDocument();
  });

  it("shows a complete multiline system error and supports dismissing it", async () => {
    const user = userEvent.setup();
    mount();
    const message = `空间祖先路径不完整\n${"contract diagnostic ".repeat(40)}end of diagnostic`;
    act(() => toast.error(new ApiError(500, "INTERNAL_ERROR", message)));
    const title = await screen.findByText(/end of diagnostic/);
    expect(title.textContent).toBe(message);
    await user.click(screen.getByRole("button", { name: "关闭提示" }));
    await waitFor(() => expect(screen.queryByText(/end of diagnostic/)).not.toBeInTheDocument());
  });

  it("keeps the id available for manual copying when clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    mount();
    act(() =>
      toast.error(new ApiError(503, "SERVICE_UNAVAILABLE", "unsafe", undefined, "req-manual")),
    );
    await user.click(await screen.findByRole("button", { name: "复制错误编号" }));
    expect(await screen.findByText(/复制失败，请手动复制/)).toHaveTextContent("req-manual");
  });

  it("does not offer an error id for network errors and preserves business explanations", async () => {
    mount();
    act(() => toast.error(new ApiError(0, "INTERNAL_ERROR", "network")));
    expect(await screen.findByText("网络异常，请检查网络连接")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制错误编号" })).not.toBeInTheDocument();
    act(() => toast.error(new ApiError(403, "FORBIDDEN", "没有此操作权限")));
    await waitFor(() => expect(screen.getByText("没有此操作权限")).toBeInTheDocument());
  });
});

it("supports a dismissible initial-password warning and keyboard action through the shared toaster", async () => {
  const user = userEvent.setup();
  mount();
  const onClick = vi.fn();
  act(() =>
    toast.warning("您尚未修改初始密码，请及时修改。", {
      closeButton: true,
      action: { label: "修改密码", onClick },
    }),
  );
  const action = await screen.findByRole("button", { name: "修改密码" });
  action.focus();
  await user.keyboard("{Enter}");
  expect(onClick).toHaveBeenCalledOnce();
});
