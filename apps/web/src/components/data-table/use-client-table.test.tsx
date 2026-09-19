import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useClientTable } from "./use-client-table";

const data = Array.from({ length: 25 }, (_, id) => ({ id, name: `row-${id}` }));
const columns = [{ accessorKey: "name" }];

describe("useClientTable", () => {
  it("resets the page when filters, sort order or page size change", () => {
    const { result } = renderHook(() => useClientTable(data, columns));
    act(() => result.current.setPageIndex(2));
    expect(result.current.state.pagination.pageIndex).toBe(2);
    act(() => result.current.setGlobalFilter("row-24"));
    expect(result.current.state.pagination.pageIndex).toBe(0);
    expect(result.current.getRowModel().rows.map((row) => row.original.id)).toEqual([24]);
    act(() => result.current.setGlobalFilter(""));
    act(() => result.current.setPageIndex(2));
    act(() => result.current.setSorting([{ id: "name", desc: true }]));
    expect(result.current.getRowModel().rows[0]?.original.id).toBe(24);
    expect(result.current.state.pagination.pageIndex).toBe(0);
    act(() => result.current.setPageIndex(2));
    act(() => result.current.setPageSize(20));
    expect(result.current.state.pagination).toEqual({ pageIndex: 0, pageSize: 20 });
  });

  it("filters the entire dataset before slicing pages and controls column visibility", () => {
    const { result } = renderHook(() => useClientTable(data, columns));
    act(() => result.current.setPageIndex(2));
    act(() => result.current.setColumnFilters([{ id: "name", value: "row-1" }]));
    expect(result.current.state.pagination.pageIndex).toBe(0);
    expect(result.current.getFilteredRowModel().rows).toHaveLength(11);
    expect(result.current.getRowModel().rows).toHaveLength(10);
    act(() => result.current.setColumnVisibility({ name: false }));
    expect(result.current.getVisibleLeafColumns()).toHaveLength(0);
  });
});
