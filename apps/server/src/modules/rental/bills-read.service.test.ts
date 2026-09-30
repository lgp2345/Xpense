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
            detail: async () => null,
          },
        },
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
            detail: async () => null,
          },
        },
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
    expect(page.items[0]?.sourceKey).toBe("monthly:2026-09");
    expect(page.coverage).toBeNull();
    await module.close();
  });
});
