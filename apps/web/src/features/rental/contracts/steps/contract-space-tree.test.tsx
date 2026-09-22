import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalSpaceNode } from "@xpense/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RentalApi } from "../../../../services/rental-api";
import { defaultContractFormValues } from "../contract-form-schema";
import { ContractSpacesStep } from "./contract-spaces-step";

const node = (id: string, parentId: string | null = null): RentalSpaceNode => ({
  id,
  parentId,
  propertyId: "property",
  name: id,
  code: null,
  type: "room",
  customTypeName: null,
  isRentable: true,
  isActive: true,
  note: null,
  isEffectivelyActive: true,
  sortOrder: 0,
  hasChildren: false,
  leaseStatus: "vacant",
  leaseBlockedReason: null,
  hasUpcomingContract: false,
});
const result = (items: RentalSpaceNode[], page = 1, total = items.length) => ({
  items,
  page,
  total,
  pageSize: 1,
});

function setup(api: RentalApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [values, setValues] = useState(defaultContractFormValues("property"));
    const [read, setRead] = useState(true);
    return (
      <QueryClientProvider client={client}>
        <button type="button" onClick={() => setRead(false)}>
          撤销读取
        </button>
        <button type="button" onClick={() => setValues(defaultContractFormValues("other"))}>
          切换房产
        </button>
        <ContractSpacesStep
          api={api}
          organizationId="org"
          permissions={read ? ["rental_spaces:read"] : []}
          values={values}
          onChange={setValues}
          showPropertySelector={false}
        />
      </QueryClientProvider>
    );
  }
  render(<Harness />);
  return userEvent.setup();
}

const option = (id: string) => within(screen.getByTestId(`space-option-${id}`));

describe("contract space hierarchy", () => {
  it("debounces typing and cancels pending search when cleared", async () => {
    const searchSpaces = vi.fn().mockResolvedValue(result([node("201")]));
    const api = {
      listChildren: vi.fn().mockResolvedValue(result([node("楼层")])),
      searchSpaces,
    } as unknown as RentalApi;
    const user = setup(api);
    await screen.findByTestId("space-option-楼层");
    await user.type(screen.getByLabelText("搜索空间"), "201");
    expect(searchSpaces).not.toHaveBeenCalled();
    expect(await screen.findByTestId("space-option-201")).toBeVisible();
    expect(searchSpaces).toHaveBeenCalledTimes(1);
    expect(searchSpaces).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "201", page: 1 }),
    );
    await user.clear(screen.getByLabelText("搜索空间"));
    expect(screen.getByTestId("space-option-楼层")).toBeVisible();
    await user.type(screen.getByLabelText("搜索空间"), "202");
    await user.clear(screen.getByLabelText("搜索空间"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(searchSpaces).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("space-option-楼层")).toBeVisible();
  });

  it("keeps non-rentable parents expandable, retries failed children and paginates within the branch", async () => {
    let failed = false;
    const api = {
      listChildren: vi.fn(async ({ parentId, page }: { parentId: string | null; page: number }) => {
        if (!parentId) return result([{ ...node("楼层"), hasChildren: true, isRentable: false }]);
        if (!failed) {
          failed = true;
          throw new Error("private service error");
        }
        return result([node(page === 1 ? "201" : "202", "楼层")], page, 2);
      }),
    } as unknown as RentalApi;
    const user = setup(api);
    await user.click(await screen.findByRole("button", { name: "展开 楼层" }));
    expect(option("楼层").getByRole("button", { name: "选择" })).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("子空间加载失败");
    expect(screen.queryByText("private service error")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试子空间" }));
    await screen.findByTestId("space-option-201");
    await user.click(screen.getByRole("button", { name: "加载更多子空间" }));
    await screen.findByTestId("space-option-202");
    await user.click(screen.getByRole("button", { name: "收起 楼层" }));
    await user.click(screen.getByRole("button", { name: "展开 楼层" }));
    expect(await screen.findByTestId("space-option-202")).toBeVisible();
    await user.click(option("201").getByRole("button", { name: "选择" }));
    await user.click(option("202").getByRole("button", { name: "选择" }));
    const selected = within(screen.getByRole("group", { name: "已选空间" }));
    expect(selected.getByText("楼层 / 201")).toBeVisible();
    expect(selected.getByText("楼层 / 202")).toBeVisible();
  });

  it("allows browsing a selected parent but disables descendants until the parent is removed", async () => {
    const api = {
      listChildren: vi.fn(async ({ parentId }: { parentId: string | null }) =>
        result(parentId ? [node("201", "楼层")] : [{ ...node("楼层"), hasChildren: true }]),
      ),
    } as unknown as RentalApi;
    const user = setup(api);
    await screen.findByTestId("space-option-楼层");
    await user.click(option("楼层").getByRole("button", { name: "选择" }));
    await user.click(screen.getByRole("button", { name: "展开 楼层" }));
    await screen.findByTestId("space-option-201");
    expect(option("201").getByRole("button", { name: "选择" })).toBeDisabled();
    await user.click(option("楼层").getByRole("button", { name: "移除 楼层" }));
    expect(option("201").getByRole("button", { name: "选择" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "撤销读取" }));
    expect(screen.queryByRole("button", { name: "收起 楼层" })).not.toBeInTheDocument();
    expect(screen.getByText("你没有查看空间的权限。")).toBeVisible();
  });

  it("does not show old descendants after switching property during a pending load", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    const pending = new Promise<ReturnType<typeof result>>((done) => {
      resolve = done;
    });
    const api = {
      listChildren: vi.fn(
        async ({ propertyId, parentId }: { propertyId: string; parentId: string | null }) => {
          if (propertyId === "other") return result([node("新房产空间")]);
          return parentId ? pending : result([{ ...node("旧楼层"), hasChildren: true }]);
        },
      ),
    } as unknown as RentalApi;
    const user = setup(api);
    await user.click(await screen.findByRole("button", { name: "展开 旧楼层" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在加载子空间");
    await user.click(screen.getByRole("button", { name: "切换房产" }));
    await screen.findByTestId("space-option-新房产空间");
    await act(async () => resolve(result([node("旧房间", "旧楼层")])));
    expect(screen.queryByText("旧房间")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收起 旧楼层" })).not.toBeInTheDocument();
  });

  it("shows an empty branch and supports keyboard expansion", async () => {
    const api = {
      listChildren: vi.fn(async ({ parentId }: { parentId: string | null }) =>
        result(parentId ? [] : [{ ...node("空楼层"), hasChildren: true }]),
      ),
    } as unknown as RentalApi;
    const user = setup(api);
    const expand = await screen.findByRole("button", { name: "展开 空楼层" });
    expand.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("暂无子空间。")).toBeVisible();
    expect(expand).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(expand).toHaveAttribute("aria-expanded", "false");
  });
});
