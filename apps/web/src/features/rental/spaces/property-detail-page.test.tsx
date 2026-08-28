import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { RentalPropertyDetail } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { PropertyDetailPage } from "./property-detail-page";

const detail: RentalPropertyDetail = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  ledgerId: "223e4567-e89b-42d3-a456-426614174000",
  name: "阳光公寓",
  type: "apartment_building",
  customTypeName: null,
  countryCode: "CN",
  province: "广东省",
  city: "深圳市",
  district: "南山区",
  addressLine: "科技园路 88 号",
  isActive: false,
  spaceCount: 12,
  rentableSpaceCount: 10,
  note: "临近地铁",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

function renderPage(api: Pick<RentalApi, "getProperty">) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PropertyDetailPage api={api} organizationId="org-a" propertyId={detail.id} />
    </QueryClientProvider>,
  );
}

describe("PropertyDetailPage", () => {
  it("shows loading and an independently useful property header without ledger leakage", async () => {
    let resolve: ((value: RentalPropertyDetail) => void) | undefined;
    renderPage({
      getProperty: vi.fn(
        () =>
          new Promise<RentalPropertyDetail>((done) => {
            resolve = done;
          }),
      ),
    });
    expect(screen.getByText("正在加载房产详情...")).toBeInTheDocument();
    resolve?.(detail);
    expect(await screen.findByRole("heading", { name: "阳光公寓" })).toBeInTheDocument();
    expect(screen.getByText("停用")).toBeInTheDocument();
    expect(screen.getByText(/广东省 深圳市 南山区 科技园路 88 号/)).toBeInTheDocument();
    expect(screen.queryByText(detail.ledgerId)).not.toBeInTheDocument();
  });

  it("distinguishes missing and failed property detail responses", async () => {
    renderPage({
      getProperty: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing")),
    });
    expect(await screen.findByText("房产不存在或已被删除。")).toBeInTheDocument();
    renderPage({ getProperty: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await screen.findByRole("alert")).toHaveTextContent("加载房产详情失败");
  });
});
