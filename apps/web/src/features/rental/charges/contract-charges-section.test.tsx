import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { chargeTermsFixture, financeApiFixture } from "../bills/bill-test-fixtures";
import { ContractChargesSection } from "./contract-charges-section";

describe("合同收费与入住底数", () => {
  it("展示服务端收费标准和明确标为入住底数的水电读数", async () => {
    const api = financeApiFixture();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContractChargesSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={["rental_charges:read", "rental_meters:read"]}
          canEdit={true}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("水费单价 CNY 3.0000 / 立方米")).toBeInTheDocument();
    expect(screen.getByText("电费单价 CNY 4.0000 / 度")).toBeInTheDocument();
    expect(screen.getByText("入住水表底数 100 · 2026/01/01")).toBeInTheDocument();
    expect(screen.getByText("入住电表底数 250 · 2026/01/01")).toBeInTheDocument();
  });

  it("没有读取权限时不请求财务数据", () => {
    const api = financeApiFixture();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContractChargesSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={[]}
          canEdit={true}
        />
      </QueryClientProvider>,
    );
    expect(api.getChargeTerms).not.toHaveBeenCalled();
    expect(api.getMeterBaseline).not.toHaveBeenCalled();
  });
});

it("分开展示不代收、零底数与待补状态", async () => {
  const api = financeApiFixture({
    getChargeTerms: vi
      .fn()
      .mockResolvedValue({ ...chargeTermsFixture, electricityCollectionEnabled: false }),
    getMeterBaseline: vi.fn().mockResolvedValue({ version: "m", readings: [] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContractChargesSection
        organizationId="org"
        contractId="contract"
        api={api}
        permissions={["rental_charges:read", "rental_meters:read"]}
        canEdit
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("电费：不代收")).toBeInTheDocument();
  expect(await screen.findByText("水表底数待补")).toBeInTheDocument();
  expect(screen.queryByText(/电费单价 CNY/)).not.toBeInTheDocument();
});
