import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

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
});
