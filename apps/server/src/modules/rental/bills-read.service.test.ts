import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { AccessService } from "../iam/access.service.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillsRepository } from "./bills.repository.js";
import { BillsReadService } from "./bills-read.service.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { listBillsSchema } from "./dto/list-bills.dto.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

function cashFacts(
  contractId: string,
  billId: string,
  amountMinor: number,
  receivedMinor = 0,
): RentalCashProjectionFacts {
  return {
    organizationId: "org",
    contractId,
    contract: {
      billingMode: "monthly_settlement",
      lifecycleStatus: "confirmed",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      rentAmountMinor: 100_000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 5,
      terminationDate: null,
      cancelledAt: null,
    },
    bills: [
      {
        id: billId,
        type: "monthly",
        status: "active",
        modelVersion: 2,
        billingMonth: "2026-09",
        revision: 1,
        amountMinor,
        sourceKey: "monthly:2026-09",
        dueDate: "2026-09-30",
      },
    ],
    cashEntries: receivedMinor
      ? [
          {
            id: `cash-${billId}`,
            contractId,
            billId,
            settlementId: null,
            kind: "receipt",
            purpose: "bill_receipt",
            amountMinor: receivedMinor,
            occurredOn: "2026-09-01",
            revokedAt: null,
          },
        ]
      : [],
    settlement: null,
    settlementBillIds: [],
    readings: [],
  };
}

describe("只读应收查询", () => {
  it("仅 read 权限可查完整 coverage，未知账单 404", async () => {
    const source = rentalBillingSource();
    const transaction = {};
    const module = await Test.createTestingModule({
      providers: [
        BillsReadService,
        {
          provide: BillsRepository,
          useValue: {
            list: async () => ({
              items: [],
              total: 0,
              page: 1,
              pageSize: 20,
              totals: { rentAmountMinor: 0, depositAmountMinor: 0 },
              coverage: null,
            }),
            matchingFinancialBills: async () => [],
            detail: async () => null,
          },
        },
        { provide: RentalCashProjectionRepository, useValue: { readMany: async () => [] } },
        { provide: BillingSourceService, useValue: { read: async () => source } },
        {
          provide: ContractsPolicyService,
          useValue: {
            lockOrganizationContext: async () => ({
              today: "2026-12-31",
              timezone: "Asia/Shanghai",
            }),
          },
        },
        {
          provide: AccessService,
          useValue: {
            assertPermission: (_auth: unknown, key: string) => {
              expect(key).toBe("rental_bills:read");
            },
          },
        },
        {
          provide: DatabaseTransactionService,
          useValue: {
            run: async (operation: (tx: unknown) => Promise<unknown>) => operation(transaction),
          },
        },
      ],
    }).compile();
    const auth = {
      organizationId: "org",
      userId: "user",
      sessionId: "session",
      isSuperAdmin: false,
      permissions: ["rental_bills:read" as const],
    };
    const page = await module
      .get(BillsReadService)
      .list(auth, listBillsSchema.parse({ contractId: source.contract.id }));
    expect(page.coverage).toEqual({
      existingRentCount: 0,
      existingDepositCount: 0,
      missingRentCount: 4,
      missingDepositCount: 2,
    });
    await expect(
      module.get(BillsReadService).detail(auth, { id: "missing" }),
    ).rejects.toMatchObject({ status: 404 });
    await module.close();
  });

  it("月度合同按实际月度来源键列账单，不生成旧租金覆盖计数", async () => {
    const source = rentalBillingSource({ billingMode: "monthly_settlement" });
    const monthlyBill = {
      id: "monthly-bill",
      billNumber: "RB-2026-000001",
      contractId: source.contract.id,
      contractNumber: source.contract.contractNumber,
      propertyId: source.contract.propertyId,
      propertyName: source.contract.propertyName,
      currencyCode: "CNY",
      type: "monthly",
      status: "active",
      sourceKey: "monthly:2026-09",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-09-30",
      amountMinor: 12300,
      dueState: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      modelVersion: 2,
      billingMonth: "2026-09",
      revision: 1,
    };
    const sourceRead = { read: vi.fn(async () => source) };
    const financialFacts = cashFacts(source.contract.id, monthlyBill.id, monthlyBill.amountMinor);
    const projectionSources = { readMany: vi.fn(async () => [financialFacts]) };
    const module = await Test.createTestingModule({
      providers: [
        BillsReadService,
        {
          provide: BillsRepository,
          useValue: {
            list: async () => ({
              items: [monthlyBill],
              total: 1,
              page: 1,
              pageSize: 20,
              totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 12300 },
              coverage: null,
            }),
            matchingFinancialBills: vi.fn(async () => [
              { id: monthlyBill.id, contractId: source.contract.id, modelVersion: 2 },
            ]),
            detail: async () => null,
          },
        },
        { provide: RentalCashProjectionRepository, useValue: projectionSources },
        { provide: BillingSourceService, useValue: sourceRead },
        {
          provide: ContractsPolicyService,
          useValue: { lockOrganizationContext: async () => ({ today: "2026-09-01" }) },
        },
        { provide: AccessService, useValue: { assertPermission: () => undefined } },
        {
          provide: DatabaseTransactionService,
          useValue: { run: async (operation: (tx: unknown) => Promise<unknown>) => operation({}) },
        },
      ],
    }).compile();
    const page = await module.get(BillsReadService).list(
      {
        organizationId: "org",
        userId: "user",
        sessionId: "session",
        isSuperAdmin: false,
        permissions: ["rental_bills:read"],
      },
      listBillsSchema.parse({ contractId: source.contract.id }),
    );

    expect(sourceRead.read).toHaveBeenCalledWith("org", source.contract.id, expect.anything());
    expect(
      (module.get(BillsRepository) as unknown as Record<string, unknown>).matchingFinancialBills,
    ).toHaveBeenCalledWith(
      "org",
      expect.objectContaining({ contractId: source.contract.id }),
      expect.anything(),
    );
    expect(page.items[0]?.sourceKey).toBe("monthly:2026-09");
    expect(page.items[0]?.financial).toMatchObject({
      receivedMinor: 0,
      outstandingMinor: 12_300,
      version: rentalCashSourceVersion(financialFacts, { kind: "bill", billId: monthlyBill.id }),
    });
    expect(page.totals.financial).toEqual({
      receivedMinor: 0,
      refundedMinor: 0,
      outstandingMinor: 12_300,
      refundableMinor: 0,
    });
    expect(projectionSources.readMany).toHaveBeenCalledWith(
      "org",
      [source.contract.id],
      expect.anything(),
    );
    expect(page.coverage).toBeNull();
    await module.close();
  });

  it("loads page cash facts once per distinct contract and returns the same detail write version", async () => {
    const contractA = "contract-a";
    const contractB = "contract-b";
    const billA = "bill-a";
    const billB = "bill-b";
    const contractIds = [contractA, contractB];
    const facts = [cashFacts(contractA, billA, 1_000), cashFacts(contractB, billB, 2_000, 1_000)];
    const secondFact = facts.find((item) => item.contractId === contractB);
    if (!secondFact) throw new Error("Second contract finance facts missing");
    const summaries = facts.map((item, index) => ({
      id: index === 0 ? billA : billB,
      billNumber: `RB-2026-${index}`,
      contractId: item.contractId,
      contractNumber: `RC-${index}`,
      propertyId: "property",
      propertyName: "房产",
      currencyCode: "CNY",
      type: "monthly" as const,
      status: "active" as const,
      sourceKey: "monthly:2026-09",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      effectiveEnd: null,
      dueDate: "2026-09-30",
      amountMinor: item.bills[0]?.amountMinor ?? 0,
      dueState: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      modelVersion: 2 as const,
      billingMonth: "2026-09",
      revision: 1,
    }));
    const secondSummary = summaries[1];
    if (!secondSummary) throw new Error("Second bill summary missing");
    const tx = {};
    const bills = {
      list: vi.fn(async () => ({
        items: summaries,
        total: summaries.length,
        page: 1,
        pageSize: 20,
        totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 3_000 },
        coverage: null,
      })),
      matchingFinancialBills: vi.fn(async () =>
        summaries.map((summary) => ({
          id: summary.id,
          contractId: summary.contractId,
          modelVersion: 2,
        })),
      ),
      detail: vi.fn(async () => ({
        ...secondSummary,
        lines: [],
        history: [],
        generationId: null,
        adjustmentId: null,
        adjustment: null,
        snapshot: {},
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
      })),
    };
    const projectionSources = {
      readMany: vi.fn(async (_organizationId: string, ids: string[]) =>
        facts.filter((item) => ids.includes(item.contractId)),
      ),
    };
    const service = new BillsReadService(
      bills as never,
      projectionSources as never,
      { read: vi.fn() } as never,
      { lockOrganizationContext: vi.fn(async () => ({ today: "2026-09-01" })) } as never,
      { assertPermission: vi.fn() } as never,
      { run: vi.fn((operation) => operation(tx)) } as never,
    );
    const auth = { organizationId: "org", userId: "user" } as never;

    const page = await service.list(auth, listBillsSchema.parse({}));
    const detail = await service.detail(auth, { id: billB });

    expect(projectionSources.readMany).toHaveBeenNthCalledWith(1, "org", contractIds, tx);
    expect(projectionSources.readMany).toHaveBeenNthCalledWith(2, "org", [contractIds[1]], tx);
    expect(page.items[1]?.financial).toMatchObject({
      receivedMinor: 1_000,
      outstandingMinor: 1_000,
      version: rentalCashSourceVersion(secondFact, { kind: "bill", billId: billB }),
    });
    expect(page.totals.financial).toEqual({
      receivedMinor: 1_000,
      refundedMinor: 0,
      outstandingMinor: 2_000,
      refundableMinor: 0,
    });
    expect(detail.financial?.version).toBe(page.items[1]?.financial?.version);
  });

  it("页1、页2和越界空页返回相同的全筛选财务总计", async () => {
    const summaries = [
      {
        id: "bill-a",
        billNumber: "RB-2026-A",
        contractId: "contract-a",
        contractNumber: "RC-A",
        propertyId: "property",
        propertyName: "房产",
        currencyCode: "CNY",
        type: "monthly" as const,
        status: "active" as const,
        sourceKey: "monthly:2026-09",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        effectiveEnd: null,
        dueDate: "2026-09-30",
        amountMinor: 100,
        dueState: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        modelVersion: 2 as const,
        billingMonth: "2026-09",
        revision: 1,
      },
      {
        id: "bill-b",
        billNumber: "RB-2026-B",
        contractId: "contract-b",
        contractNumber: "RC-B",
        propertyId: "property",
        propertyName: "房产",
        currencyCode: "CNY",
        type: "monthly" as const,
        status: "active" as const,
        sourceKey: "monthly:2026-09",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        effectiveEnd: null,
        dueDate: "2026-09-30",
        amountMinor: 0,
        dueState: null,
        createdAt: "2026-09-02T00:00:00.000Z",
        modelVersion: 2 as const,
        billingMonth: "2026-09",
        revision: 1,
      },
    ];
    const facts = [
      cashFacts("contract-a", "bill-a", 100),
      cashFacts("contract-b", "bill-b", 0, 70),
    ];
    const bills = {
      list: vi.fn(async (_organizationId: string, query: { page: number; pageSize: number }) => ({
        items: summaries.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        total: summaries.length,
        page: query.page,
        pageSize: query.pageSize,
        totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 100 },
        coverage: null,
      })),
      matchingFinancialBills: vi.fn(async () =>
        summaries.map(({ id, contractId }) => ({ id, contractId, modelVersion: 2 })),
      ),
    };
    const projectionSources = {
      readMany: vi.fn(async (_organizationId: string, contractIds: string[]) =>
        facts.filter(({ contractId }) => contractIds.includes(contractId)),
      ),
    };
    const service = new BillsReadService(
      bills as never,
      projectionSources as never,
      { read: vi.fn() } as never,
      { lockOrganizationContext: vi.fn(async () => ({ today: "2026-09-01" })) } as never,
      { assertPermission: vi.fn() } as never,
      { run: vi.fn((operation) => operation({ transaction: "same" })) } as never,
    );
    const auth = { organizationId: "org" } as never;

    const pages = await Promise.all(
      [1, 2, 3].map((page) => service.list(auth, listBillsSchema.parse({ page, pageSize: 1 }))),
    );

    expect(pages.map(({ totals }) => totals.financial)).toEqual([
      { receivedMinor: 70, refundedMinor: 0, outstandingMinor: 100, refundableMinor: 70 },
      { receivedMinor: 70, refundedMinor: 0, outstandingMinor: 100, refundableMinor: 70 },
      { receivedMinor: 70, refundedMinor: 0, outstandingMinor: 100, refundableMinor: 70 },
    ]);
    expect(pages.map(({ items }) => items.length)).toEqual([1, 1, 0]);
  });

  it("空分页仍读取全部筛选身份及完整合同事实，并在同一事务中按500合同分批", async () => {
    const financialBills = Array.from({ length: 501 }, (_, index) => ({
      id: `bill-${index}`,
      contractId: `contract-${index}`,
      modelVersion: 2,
    }));
    const query = listBillsSchema.parse({ page: 9, pageSize: 1, status: "voided" });
    const tx = { transaction: "same" };
    const bills = {
      list: vi.fn(async () => ({
        items: [],
        total: 501,
        page: 9,
        pageSize: 1,
        totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 0 },
        coverage: null,
      })),
      matchingFinancialBills: vi.fn(async () => financialBills),
      detail: vi.fn(),
    };
    const projectionSources = {
      readMany: vi.fn(async (_organizationId: string, ids: string[]) =>
        ids.map((contractId) => {
          const bill = financialBills.find((item) => item.contractId === contractId);
          if (!bill) throw new Error("missing test financial bill");
          return cashFacts(contractId, bill.id, 100);
        }),
      ),
    };
    const service = new BillsReadService(
      bills as never,
      projectionSources as never,
      { read: vi.fn() } as never,
      { lockOrganizationContext: vi.fn(async () => ({ today: "2026-09-01" })) } as never,
      { assertPermission: vi.fn() } as never,
      { run: vi.fn((operation) => operation(tx)) } as never,
    );

    const page = await service.list({ organizationId: "org" } as never, query);

    expect(bills.list).toHaveBeenCalledWith("org", query, tx);
    expect(bills.matchingFinancialBills).toHaveBeenCalledWith("org", query, tx);
    expect(projectionSources.readMany).toHaveBeenNthCalledWith(
      1,
      "org",
      financialBills.slice(0, 500).map(({ contractId }) => contractId),
      tx,
    );
    expect(projectionSources.readMany).toHaveBeenNthCalledWith(
      2,
      "org",
      [financialBills[500]?.contractId],
      tx,
    );
    expect(page.items).toEqual([]);
    expect(page.totals.financial).toEqual({
      receivedMinor: 0,
      refundedMinor: 0,
      outstandingMinor: 50_100,
      refundableMinor: 0,
    });
  });

  it("legacy-only 筛选省略可选 financial 字段", async () => {
    const totals = { rentAmountMinor: 1_000, depositAmountMinor: 0 };
    const bills = {
      list: vi.fn(async () => ({
        items: [{ id: "legacy-bill", contractId: "legacy-contract", modelVersion: 1 }],
        total: 1,
        page: 1,
        pageSize: 20,
        totals,
        coverage: null,
      })),
      matchingFinancialBills: vi.fn(async () => [
        { id: "legacy-bill", contractId: "legacy-contract", modelVersion: 1 },
      ]),
    };
    const projectionSources = { readMany: vi.fn(async () => []) };
    const service = new BillsReadService(
      bills as never,
      projectionSources as never,
      { read: vi.fn() } as never,
      { lockOrganizationContext: vi.fn(async () => ({ today: "2026-09-01" })) } as never,
      { assertPermission: vi.fn() } as never,
      { run: vi.fn((operation) => operation({})) } as never,
    );

    const page = await service.list({ organizationId: "org" } as never, listBillsSchema.parse({}));

    expect(page.totals).toEqual(totals);
    expect(page.totals).not.toHaveProperty("financial");
    expect(projectionSources.readMany).not.toHaveBeenCalled();
  });

  it("匹配新版账单但批量合同事实缺失时失败，不把缺失事实当作零", async () => {
    const query = listBillsSchema.parse({ page: 2, pageSize: 1 });
    const bill = { id: "bill-a", contractId: "contract-a", modelVersion: 2 };
    const service = new BillsReadService(
      {
        list: vi.fn(async () => ({
          items: [],
          total: 1,
          page: 2,
          pageSize: 1,
          totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 0 },
          coverage: null,
        })),
        matchingFinancialBills: vi.fn(async () => [bill]),
      } as never,
      { readMany: vi.fn(async () => []) } as never,
      { read: vi.fn() } as never,
      { lockOrganizationContext: vi.fn(async () => ({ today: "2026-09-01" })) } as never,
      { assertPermission: vi.fn() } as never,
      { run: vi.fn((operation) => operation({})) } as never,
    );

    await expect(service.list({ organizationId: "org" } as never, query)).rejects.toThrow(
      "Rental bill finance facts could not be loaded",
    );
  });
});
