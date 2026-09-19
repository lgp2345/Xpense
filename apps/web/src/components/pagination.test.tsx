import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTablePagination } from "./data-table/pagination";
import { LoadMoreButton } from "./load-more-button";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("uses numbered icon navigation by default and keeps the same controls without totals", () => {
    const { rerender } = render(
      <Pagination page={2} pageSize={10} total={30} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "下一页" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByText("第 2 页，共 3 页")).toBeInTheDocument();
    rerender(<Pagination page={2} hasNextPage onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "下一页" }).querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "末页" })).not.toBeInTheDocument();
  });

  it("uses one-based pages and prevents navigating beyond the first and last page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pageSize={20} total={21} onPageChange={onPageChange} />,
    );
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    rerender(<Pagination page={2} pageSize={20} total={21} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "上一页" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("allows returning from an empty out-of-range page", () => {
    render(<Pagination page={3} pageSize={20} total={0} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("uses the caller's next-page availability when totals are unknown", () => {
    const { rerender } = render(<Pagination page={1} hasNextPage onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();
    rerender(<Pagination page={2} hasNextPage={false} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("renders numbered navigation and emits first, last and selected pages", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} pageCount={10} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "首页" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "末页" }));
    expect(onPageChange).toHaveBeenLastCalledWith(10);
    await user.click(screen.getByRole("button", { name: "6" }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
  });

  it("blocks every navigation action while pending and does not submit a containing form", () => {
    const onPageChange = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const { rerender } = render(
      <Pagination page={2} pageCount={4} pending onPageChange={onPageChange} />,
    );
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    rerender(
      <form onSubmit={onSubmit}>
        <Pagination page={1} pageSize={20} total={40} onPageChange={onPageChange} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("supports controlled page size selection", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={10}
        total={100}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "每页行数" }));
    await user.click(screen.getByRole("option", { name: "20" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });
});

describe("LoadMoreButton", () => {
  it("disables repeated loading and retains its accessible name", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<LoadMoreButton onClick={onClick}>加载更多空间</LoadMoreButton>);
    await user.click(screen.getByRole("button", { name: "加载更多空间" }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <LoadMoreButton
        pending
        pendingLabel="正在加载..."
        aria-label="加载更多空间"
        onClick={onClick}
      >
        加载更多空间
      </LoadMoreButton>,
    );
    expect(screen.getByRole("button", { name: "加载更多空间" })).toBeDisabled();
    expect(screen.getByText("正在加载...")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加载更多空间" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("DataTablePagination", () => {
  it("converts one-based navigation back to the table's zero-based page index", async () => {
    const user = userEvent.setup();
    const table = {
      state: { pagination: { pageIndex: 1, pageSize: 20 } },
      getPageCount: () => 4,
      getCanPreviousPage: () => true,
      getCanNextPage: () => true,
      setPageIndex: vi.fn(),
      setPageSize: vi.fn(),
    };
    render(<DataTablePagination table={table} />);
    expect(screen.getByText("第 2 页，共 4 页")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(table.setPageIndex).toHaveBeenLastCalledWith(2);
    await user.click(screen.getByRole("button", { name: "首页" }));
    expect(table.setPageIndex).toHaveBeenLastCalledWith(0);
    await user.click(screen.getByRole("button", { name: "末页" }));
    expect(table.setPageIndex).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole("combobox", { name: "每页行数" }));
    await user.click(screen.getByRole("option", { name: "30" }));
    expect(table.setPageSize).toHaveBeenCalledWith(30);
  });
});
