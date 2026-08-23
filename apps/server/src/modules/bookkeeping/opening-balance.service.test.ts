import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { OpeningBalanceService } from "./opening-balance.service.js";

describe("OpeningBalanceService", () => {
  it.each([
    [500, "excluded_inflow", 500],
    [-500, "excluded_outflow", -500],
  ] as const)("writes a signed opening balance for %s", async (amount, type, movementAmount) => {
    const executor = { kind: "transaction" };
    const repository = {
      findDefaultLedgerContext: vi.fn().mockResolvedValue({
        ledgerId: "ledger-1",
        timezone: "Asia/Shanghai",
      }),
      writeOpeningBalance: vi.fn().mockResolvedValue("transaction-1"),
    };
    const service = new OpeningBalanceService(repository as never);

    await expect(
      service.create(
        {
          organizationId: "organization-1",
          accountId: "account-1",
          actorUserId: "user-1",
          amountMinor: amount,
        },
        executor as never,
      ),
    ).resolves.toBe("transaction-1");

    expect(repository.writeOpeningBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        ledgerId: "ledger-1",
        accountId: "account-1",
        actorUserId: "user-1",
        type,
        amountMinor: 500,
        movementAmountMinor: movementAmount,
        occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      executor,
    );
  });

  it("fails within the account transaction when no default personal ledger exists", async () => {
    const repository = {
      findDefaultLedgerContext: vi.fn().mockResolvedValue(null),
      writeOpeningBalance: vi.fn(),
    };
    const service = new OpeningBalanceService(repository as never);

    await expect(
      service.create(
        {
          organizationId: "organization-1",
          accountId: "account-1",
          actorUserId: "user-1",
          amountMinor: 500,
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.writeOpeningBalance).not.toHaveBeenCalled();
  });

  it("derives occurredOn in the organization timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T16:30:00.000Z"));
    const repository = {
      findDefaultLedgerContext: vi.fn().mockResolvedValue({
        ledgerId: "ledger-1",
        timezone: "Asia/Shanghai",
      }),
      writeOpeningBalance: vi.fn().mockResolvedValue("transaction-1"),
    };
    const service = new OpeningBalanceService(repository as never);

    try {
      await service.create(
        {
          organizationId: "organization-1",
          accountId: "account-1",
          actorUserId: "user-1",
          amountMinor: 1,
        },
        {} as never,
      );

      expect(repository.writeOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ occurredOn: "2026-08-23" }),
        expect.anything(),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
