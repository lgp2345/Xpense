import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { rentalFinanceAuth, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";
import { ContractChargeSetupService } from "./contract-charge-setup.service.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

async function harness() {
  const snapshot = rentalFinanceSnapshot();
  const terms = { save: vi.fn().mockResolvedValue({ version: 1 }) };
  const readings = {
    saveBaseline: vi.fn(),
    clearDraftBaselines: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  };
  const audit = { appendRequired: vi.fn() };
  const access = {
    assertPermission: vi.fn((auth, key) => {
      if (!auth.permissions.includes(key)) throw new Error("无权限");
    }),
  };
  const module = await Test.createTestingModule({
    providers: [
      ContractChargeSetupService,
      { provide: ChargeTermsRepository, useValue: terms },
      { provide: MeterReadingsRepository, useValue: readings },
      {
        provide: RentalFinanceSourceService,
        useValue: { read: vi.fn().mockResolvedValue(snapshot) },
      },
      { provide: AuditService, useValue: audit },
      { provide: AccessService, useValue: access },
    ],
  }).compile();
  return {
    service: module.get(ContractChargeSetupService),
    snapshot,
    terms,
    readings,
    audit,
    module,
  };
}
const setup = {
  chargeTerms: {
    waterCollectionEnabled: true,
    electricityCollectionEnabled: false,
    waterUnitPrice: "3",
    electricityUnitPrice: "9",
    fixedFees: [{ id: "management", name: "管理费", monthlyAmountMinor: 5000 }],
  },
  baselineReadings: [],
};

describe("合同收费初始化", () => {
  it("保存独立代收与全额月费，允许无底数", async () => {
    const h = await harness();
    await h.service.save(
      { ...rentalFinanceAuth, permissions: [...rentalFinanceAuth.permissions] },
      h.snapshot.context,
      setup,
      {} as never,
    );
    expect(h.terms.save).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: h.snapshot.contract.id }),
      expect.objectContaining({
        electricityCollectionEnabled: false,
        electricityUnitPrice: "0.0000",
        fixedFees: setup.chargeTerms.fixedFees,
      }),
      expect.any(String),
      { userId: "user" },
      {},
    );
    expect(h.readings.saveBaseline).not.toHaveBeenCalled();
    await h.module.close();
  });
  it("零底数保留真实读数，非代收读数被拒绝", async () => {
    const h = await harness();
    const baseline = { kind: "water" as const, readingDate: "2026-09-01", reading: "0" };
    await h.service.save(
      { ...rentalFinanceAuth, permissions: [...rentalFinanceAuth.permissions] },
      h.snapshot.context,
      { ...setup, baselineReadings: [baseline] },
      {} as never,
    );
    expect(h.readings.saveBaseline).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ reading: "0", kind: "water", predecessorId: null })],
      expect.any(String),
      expect.anything(),
      {},
    );
    await expect(
      h.service.save(
        { ...rentalFinanceAuth, permissions: [...rentalFinanceAuth.permissions] },
        h.snapshot.context,
        { ...setup, baselineReadings: [{ ...baseline, kind: "electricity" }] },
        {} as never,
      ),
    ).rejects.toThrow("不代收");
    await h.module.close();
  });
  it("收费及非空底数分别检查权限且写失败向外传播", async () => {
    const h = await harness();
    await expect(
      h.service.save(
        {
          ...{ ...rentalFinanceAuth, permissions: [...rentalFinanceAuth.permissions] },
          permissions: [],
        },
        h.snapshot.context,
        setup,
        {} as never,
      ),
    ).rejects.toThrow("无权限");
    await expect(
      h.service.save(
        {
          ...{ ...rentalFinanceAuth, permissions: [...rentalFinanceAuth.permissions] },
          permissions: ["rental_charges:update"],
        },
        h.snapshot.context,
        {
          ...setup,
          baselineReadings: [{ kind: "water", readingDate: "2026-09-01", reading: "0" }],
        },
        {} as never,
      ),
    ).rejects.toThrow("无权限");
    h.audit.appendRequired.mockRejectedValue(new Error("审计失败"));
    await expect(
      h.service.save(
        { ...rentalFinanceAuth, permissions: [...rentalFinanceAuth.permissions] },
        h.snapshot.context,
        setup,
        {} as never,
      ),
    ).rejects.toThrow("审计失败");
    await h.module.close();
  });
});
