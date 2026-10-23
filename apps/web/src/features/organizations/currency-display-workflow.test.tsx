import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import { AccountsPage } from "@/features/bookkeeping/accounts/accounts-page";
import { formatTransactionAmount } from "@/features/bookkeeping/transactions/transaction-columns";
import { BillCashBatchReview } from "@/features/rental/bills/bill-cash-batch-items";
import { billFixture as billSummary } from "@/features/rental/bills/bill-test-fixtures";
import { PeriodBillPreview } from "@/features/rental/bills/period-bill-preview";
import { ContractChargesSection } from "@/features/rental/charges/contract-charges-section";
import { OrganizationCurrencyProvider } from "./organization-currency";

const preview = {
  period: { periodStart: "2026-10-01", periodEnd: "2026-10-31" },
  amountMinor: 101,
  lines: [
    {
      kind: "rent_period",
      label: "租金",
      sortOrder: 0,
      amountMinor: 101,
      coveredDays: 31,
      referenceDays: 31,
      baseRentAmountMinor: 101,
    },
  ],
  missingFields: [],
} as never;
describe("organization currency workflow", () => {
  it("changes accounts, transaction signs, previews and unrounded unit-price strings across organization contexts", async () => {
    const api = {
      listAccounts: vi
        .fn()
        .mockResolvedValue([{ id: "a", name: "余额账户", type: "cash", balanceMinor: 101 }]),
    } as never;
    const finance = {
      getChargeTerms: vi.fn().mockResolvedValue({
        waterCollectionEnabled: true,
        waterUnitPrice: "1.2345",
        electricityCollectionEnabled: false,
        fixedFees: [],
      }),
    } as never;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (currencyCode: string) => (
      <AppProviders queryClient={queryClient}>
        <OrganizationCurrencyProvider currencyCode={currencyCode}>
          <AccountsPage organizationId={currencyCode} api={api} permissions={[]} />
          <PeriodBillPreview preview={preview} />
          <ContractChargesSection
            organizationId={currencyCode}
            contractId="contract"
            api={finance}
            permissions={["rental_charges:read"]}
            canEdit={false}
          />
        </OrganizationCurrencyProvider>
      </AppProviders>
    );
    const view = render(ui("CNY"));
    expect(await screen.findByText("¥1.01")).toBeInTheDocument();
    expect(await screen.findByText("水费单价 ¥1.2345 / 立方米")).toBeInTheDocument();
    view.rerender(ui("USD"));
    expect(await screen.findByText("$1.01")).toBeInTheDocument();
    expect(await screen.findByText("水费单价 $1.2345 / 立方米")).toBeInTheDocument();
    expect(screen.getByText("应收 $1.01")).toBeInTheDocument();
    expect(formatTransactionAmount(1, "expense", "USD")).toBe("-$0.01");
    expect(formatTransactionAmount(0, "income", "USD")).toBe("+$0.00");
  });
  it("preserves historical bill currency and groups batch totals by each snapshot, using bigint sums", () => {
    const cny = {
      ...billSummary,
      id: "cny",
      billNumber: "CNY-snapshot",
      currencyCode: "CNY",
      type: "period" as const,
    };
    const usd = { ...cny, id: "usd", billNumber: "USD-snapshot", currencyCode: "USD" };
    render(
      <OrganizationCurrencyProvider currencyCode="USD">
        <BillCashBatchReview bills={[cny, usd]} amounts={{ cny: "1.01", usd: "2.02" }} />
      </OrganizationCurrencyProvider>,
    );
    const totals = within(screen.getByRole("region", { name: "总共收费" }));
    expect(totals.getByText("¥1.01")).toBeInTheDocument();
    expect(totals.getByText("$2.02")).toBeInTheDocument();
  });
});

it("shows an existing deposit preview in its original currency inside a USD organization", async () => {
  const { DepositBillPreview } = await import("@/features/rental/bills/deposit-bill-preview");
  const { previewFixture } = await import("@/features/rental/bills/bill-test-fixtures");
  const item = previewFixture.items.find((item) => item.type === "deposit");
  if (!item) throw new Error("缺少押金预览 fixture");
  const preview = {
    ...previewFixture,
    existingCount: 1,
    createCount: 0,
    items: [
      {
        ...item,
        currencyCode: "CNY",
        disposition: "existing" as const,
        existingBillId: "historical",
        amountMinor: 101,
      },
    ],
    depositInputs: [],
  };
  render(
    <OrganizationCurrencyProvider currencyCode="USD">
      <DepositBillPreview
        preview={preview}
        values={{ depositDueDates: {}, unifiedDate: "" }}
        busy={false}
        valid
        onValuesChange={vi.fn()}
        onPageChange={vi.fn()}
      />
    </OrganizationCurrencyProvider>,
  );
  expect(await screen.findByText("¥1.01")).toBeInTheDocument();
  expect(screen.queryByText("$1.01")).not.toBeInTheDocument();
});
