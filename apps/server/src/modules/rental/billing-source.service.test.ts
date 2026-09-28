import { Test } from "@nestjs/testing";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { BillAdjustmentsRepository } from "./bill-adjustments.repository.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";

describe("一致的计费来源", () => {
  it("所有来源从相同 executor 读取，并拒绝组织内缺失合同", async () => {
    const source = rentalBillingSource();
    const raw = {
      ...source.contract,
      updatedAt: new Date(source.contract.updatedAt),
      createdAt: new Date(source.contract.createdAt),
      parties: source.contract.parties.map((party) => ({
        ...party,
        tenantName: party.name,
        tenantType: party.type,
      })),
    };
    const where = vi
      .fn()
      .mockReturnValue({ limit: async () => [{ baseCurrency: "CNY", timezone: "Asia/Shanghai" }] });
    const executor = { select: vi.fn().mockReturnValue({ from: () => ({ where }) }) };
    const contracts = {
      detail: vi.fn().mockResolvedValue(raw),
      find: vi.fn().mockResolvedValue({ terminationRecordedAt: null }),
    };
    const module = await Test.createTestingModule({
      providers: [
        BillingSourceService,
        { provide: ContractsRepository, useValue: contracts },
        {
          provide: BillsRepository,
          useValue: { activeForContract: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: BillAdjustmentsRepository,
          useValue: { findCurrent: vi.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();
    const result = await module
      .get(BillingSourceService)
      .read("org", source.contract.id, executor as never);
    expect(result).toMatchObject({
      organizationId: "org",
      currencyCode: "CNY",
      timezone: "Asia/Shanghai",
      contract: { id: source.contract.id, parties: [{ name: "租户" }] },
      activeBills: [],
    });
    expect(new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]).params).toEqual(["org"]);
    expect(contracts.detail.mock.calls[0]?.at(-1)).toBe(executor);
    contracts.detail.mockResolvedValueOnce(null);
    await expect(
      module.get(BillingSourceService).read("org", "missing", executor as never),
    ).rejects.toMatchObject({ status: 404 });
    await module.close();
  });
});
