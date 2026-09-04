import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey, RentalSpaceNode, RentalTenantSummary } from "@xpense/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../../services/api-client";
import type { RentalApi } from "../../../../services/rental-api";
import { defaultContractFormValues } from "../contract-form-schema";
import { ContractPartiesStep } from "./contract-parties-step";
import { ContractSpacesStep } from "./contract-spaces-step";
import { ContractTermsStep, calendarPreview } from "./contract-terms-step";

const propertyId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const childId = "33333333-3333-4333-8333-333333333333";
const siblingId = "44444444-4444-4444-8444-444444444444";
const tenantId = "55555555-5555-4555-8555-555555555555";

const permissions: PermissionKey[] = ["rental_properties:read", "rental_spaces:read"];

function renderWithQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
}

function space(id: string, parent: string | null = null): RentalSpaceNode {
  return {
    id,
    propertyId,
    parentId: parent,
    name: id === parentId ? "父级" : id === childId ? "子级" : "兄弟",
    code: id,
    type: "room",
    customTypeName: null,
    isRentable: true,
    isActive: true,
    note: null,
    isEffectivelyActive: true,
    sortOrder: 1,
    hasChildren: false,
    leaseStatus: "vacant",
    leaseBlockedReason: null,
    hasUpcomingContract: false,
  };
}

function tenant(id: string, isActive = true): RentalTenantSummary {
  return {
    id,
    type: "individual",
    name: id === tenantId ? "张三" : "李四",
    phone: null,
    email: null,
    primaryContactName: null,
    primaryContactPhone: null,
    documentCountryCode: null,
    documentType: null,
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    isActive,
    contractCount: 0,
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("contract form step domains", () => {
  it.each([
    ["2026-02-30", "2026-03-01", 1],
    ["2026-03-02", "2026-03-01", 1],
    ["2026-03-01", "2026-03-02", 0],
    ["2026-03-01", "2026-03-02", -1],
    ["2026-03-01", "2026-03-02", Number.NaN],
    ["2026-03-01", "2026-03-02", Number.POSITIVE_INFINITY],
  ] as const)("returns a bounded empty preview for invalid input %j", (start, end, interval) => {
    const begin = performance.now();
    expect(calendarPreview(start, end, "calendar_month", interval)).toEqual([]);
    expect(calendarPreview(start, end, "contract_start", interval)).toEqual([]);
    expect(performance.now() - begin).toBeLessThan(100);
  });

  it.each([
    ["2026-02-01", "2026-12-31", 2, "2026-02-01 至 2026-03-31"],
    ["2026-01-01", "2026-06-30", 3, "2026-01-01 至 2026-03-31"],
    ["2024-02-01", "2024-05-31", 2, "2024-02-01 至 2024-03-31"],
  ] as const)("ends multi-month calendar periods on the final natural month day", (start, end, interval, firstPeriod) => {
    expect(calendarPreview(start, end, "calendar_month", interval)[0]).toBe(firstPeriod);
  });

  it("keeps the deposit input mounted while editable values change", async () => {
    const user = userEvent.setup();
    const values = defaultContractFormValues(propertyId);
    const onChange = vi.fn();
    const view = render(
      <ContractTermsStep
        values={{
          ...values,
          deposits: [
            {
              type: "rental",
              customName: "",
              calculationMode: "fixed_amount",
              fixedAmountText: "",
              rentMultipleText: "",
            },
          ],
        }}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "固定金额" });
    input.focus();
    view.rerender(
      <ContractTermsStep
        values={{
          ...values,
          deposits: [
            {
              type: "rental",
              customName: "",
              calculationMode: "fixed_amount",
              fixedAmountText: "1",
              rentMultipleText: "",
            },
          ],
        }}
        onChange={onChange}
      />,
    );
    expect(document.activeElement).toBe(input);
    await user.type(input, "2");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ deposits: [expect.objectContaining({ fixedAmountText: "12" })] }),
    );
  });

  it("retains selected spaces across search pages and disables both ancestor directions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const api = {
      listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      getProperty: vi.fn().mockResolvedValue({ id: propertyId, name: "房产", isActive: true }),
      listChildren: vi.fn().mockResolvedValue({
        items: [space(parentId), space(childId, parentId), space(siblingId)],
        total: 3,
        page: 1,
        pageSize: 50,
      }),
      searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi;
    const values = {
      ...defaultContractFormValues(propertyId),
      spaces: [{ spaceId: childId, rentAllocationText: "" }],
    };
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={permissions}
        values={values}
        onChange={onChange}
      />,
    );
    expect(await screen.findByTestId(`space-option-${parentId}`)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "选择" }).length).toBeGreaterThan(0);
    const parentButton = screen.getByTestId(`space-option-${parentId}`).querySelector("button");
    expect(parentButton).toBeDisabled();
    expect(parentButton).toHaveAttribute("aria-describedby", `space-reason-${parentId}`);
    const siblingButton = screen.getByTestId(`space-option-${siblingId}`).querySelector("button");
    expect(siblingButton).toBeEnabled();
    await user.click(siblingButton as HTMLButtonElement);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spaces: expect.arrayContaining([
          { spaceId: childId, rentAllocationText: "" },
          { spaceId: siblingId, rentAllocationText: "" },
        ]),
      }),
    );
    const selectedButton = within(screen.getByTestId(`space-option-${childId}`)).getByRole(
      "button",
      { name: "移除 子级" },
    );
    expect(selectedButton).toBeEnabled();
    await user.click(selectedButton);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ spaces: [] }));
  });

  it("keeps a deep selected space in its own removable selected region", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const api = {
      listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      getProperty: vi.fn().mockResolvedValue({ id: propertyId, name: "房产", isActive: true }),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={permissions}
        values={{
          ...defaultContractFormValues(propertyId),
          spaces: [{ spaceId: childId, rentAllocationText: "" }],
        }}
        onChange={onChange}
      />,
    );

    expect(await screen.findByRole("group", { name: "已选空间" })).toHaveTextContent(childId);
    await user.click(
      within(screen.getByRole("group", { name: "已选空间" })).getByRole("button", {
        name: "移除",
      }),
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ spaces: [] }));
  });

  it("blocks candidates while a selected space is unresolved and exposes the reason accessibly", async () => {
    const onChange = vi.fn();
    const unresolvedId = "99999999-9999-4999-8999-999999999999";
    const api = {
      listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      getProperty: vi.fn().mockResolvedValue({ id: propertyId, name: "房产", isActive: true }),
      listChildren: vi.fn().mockResolvedValue({
        items: [space(siblingId)],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
      searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={permissions}
        values={{
          ...defaultContractFormValues(propertyId),
          spaces: [{ spaceId: unresolvedId, rentAllocationText: "" }],
        }}
        onChange={onChange}
      />,
    );

    const option = await screen.findByTestId(`space-option-${siblingId}`);
    const button = within(option).getByRole("button", { name: "选择" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", `space-reason-${siblingId}`);
    expect(
      screen.getByText("存在未解析的已选空间，请先搜索解析或移除后再新增"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows a resolved sibling and rejects a resolved parent-child conflict after search", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const api = {
      listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      getProperty: vi.fn().mockResolvedValue({ id: propertyId, name: "房产", isActive: true }),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn().mockImplementation(async () => ({
        items: [
          {
            ...space(childId, parentId),
            path: [
              { id: parentId, name: "父级" },
              { id: childId, name: "子级" },
            ],
          },
          { ...space(parentId), path: [{ id: parentId, name: "父级" }] },
          { ...space(siblingId), path: [{ id: siblingId, name: "兄弟" }] },
        ],
        total: 3,
        page: 1,
        pageSize: 20,
      })),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={permissions}
        values={{
          ...defaultContractFormValues(propertyId),
          spaces: [{ spaceId: childId, rentAllocationText: "" }],
        }}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText("搜索空间"), "子");

    const siblingOption = await screen.findByTestId(`space-option-${siblingId}`);
    expect(within(siblingOption).getByRole("button", { name: "选择" })).toBeEnabled();
    const parentOption = screen.getByTestId(`space-option-${parentId}`);
    expect(within(parentOption).getByRole("button", { name: "选择" })).toBeDisabled();
    await user.click(within(siblingOption).getByRole("button", { name: "选择" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spaces: expect.arrayContaining([
          { spaceId: childId, rentAllocationText: "" },
          { spaceId: siblingId, rentAllocationText: "" },
        ]),
      }),
    );
  });

  it("loads an active property list for a property seed", async () => {
    const onChange = vi.fn();
    const api = {
      listProperties: vi.fn().mockResolvedValue({
        items: [{ id: propertyId, name: "种子房产", isActive: true }],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
      getProperty: vi.fn().mockResolvedValue({ id: propertyId, name: "种子房产", isActive: true }),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={permissions}
        values={defaultContractFormValues(propertyId)}
        onChange={onChange}
      />,
    );
    expect(await screen.findByRole("option", { name: "种子房产" })).toBeInTheDocument();
    expect(api.listProperties).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
  });

  it("does not validate a property without property read permission", () => {
    const onChange = vi.fn();
    const api = {
      listProperties: vi.fn(),
      getProperty: vi.fn(),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={["rental_spaces:read"]}
        values={defaultContractFormValues(propertyId)}
        onChange={onChange}
      />,
    );
    expect(api.getProperty).not.toHaveBeenCalled();
    expect(api.listProperties).not.toHaveBeenCalled();
  });

  it("explicitly ignores an unverified deep seed without pretending it can recover", async () => {
    const onChange = vi.fn();
    const api = {
      listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      getProperty: vi.fn().mockResolvedValue({ id: propertyId, name: "房产", isActive: true }),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractSpacesStep
        api={api}
        organizationId="org-a"
        permissions={permissions}
        values={defaultContractFormValues(propertyId)}
        onChange={onChange}
        seedSpaceIds={[siblingId]}
      />,
    );
    expect(
      await screen.findByText("无法验证，已忽略部分空间；深层空间不会自动恢复，请手动搜索并选择。"),
    ).toBeInTheDocument();
  });

  it("keeps a selected tenant visible and removable after it becomes inactive", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const api = {
      listTenants: vi.fn().mockResolvedValue({
        items: [tenant(tenantId, false)],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    } as unknown as RentalApi;
    const values = {
      ...defaultContractFormValues(propertyId),
      parties: [{ tenantId, isPrimaryPayer: true }],
    };
    renderWithQuery(
      <ContractPartiesStep
        api={api}
        organizationId="org-a"
        permissions={["rental_tenants:read"]}
        values={values}
        onChange={onChange}
      />,
    );
    expect((await screen.findAllByText("张三")).length).toBeGreaterThan(0);
    const selected = screen.getByRole("button", { name: "已选择" });
    expect(selected).toBeEnabled();
    await user.click(selected);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ parties: [] }));
  });

  it.each([
    [new Error("sensitive internal error")],
    [new ApiError(500, "INTERNAL", "sensitive server error")],
  ])("does not expose an unknown tenant creation error", async (cause) => {
    const user = userEvent.setup();
    const api = {
      listTenants: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      createTenant: vi.fn().mockRejectedValue(cause),
    } as unknown as RentalApi;
    renderWithQuery(
      <ContractPartiesStep
        api={api}
        organizationId="org-a"
        permissions={["rental_tenants:read", "rental_tenants:create"]}
        values={defaultContractFormValues(propertyId)}
        onChange={vi.fn()}
      />,
    );
    await user.type(await screen.findByRole("textbox", { name: "新租户名称" }), "租户");
    await user.click(screen.getByRole("button", { name: "新增租户" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("租户创建失败，请重试。");
    expect(alert).not.toHaveTextContent("sensitive");
  });
});
