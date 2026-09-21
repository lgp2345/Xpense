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

  it("uses safe fallback messages for unknown failures", async () => {
    mount();
    act(() => {
      toast.error(new Error("private detail"), "保存失败");
      toast.error(null);
    });
    expect(await screen.findByText("保存失败")).toBeInTheDocument();
    expect(await screen.findByText("操作失败，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });

  it("shows one top-center error and copies the server id", async () => {
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
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    expect(container.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-x-position",
      "center",
    );
    expect(container.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-y-position",
      "top",
    );
    await user.click(copy);
    expect(writeText).toHaveBeenCalledExactlyOnceWith("req-copy");
    expect(await screen.findByText("错误编号已复制")).toBeInTheDocument();
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
