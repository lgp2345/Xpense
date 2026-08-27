import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { RentalLedgerBoundaryService } from "./rental-ledger-boundary.service.js";

describe("RentalLedgerBoundaryService", () => {
  function createHarness() {
    const transaction = { kind: "transaction" };
    const repository = {
      createRental: vi.fn().mockResolvedValue({
        id: "rental-ledger-1",
        organizationId: "organization-1",
        name: "阳光公寓",
        type: "rental",
        isDefault: false,
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
        updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      }),
      findActiveRental: vi.fn().mockResolvedValue({ id: "rental-ledger-1" }),
      renameActiveRental: vi.fn().mockResolvedValue(true),
      hasAnyTransactionReference: vi.fn().mockResolvedValue(false),
      softDeleteActiveRental: vi.fn().mockResolvedValue(true),
    };
    const service = new RentalLedgerBoundaryService(repository as never);

    return { repository, service, transaction };
  }

  it("creates a non-default rental ledger through the caller transaction", async () => {
    const { repository, service, transaction } = createHarness();

    await expect(
      service.create(
        { organizationId: "organization-1", name: "阳光公寓", actorUserId: "user-1" },
        transaction as never,
      ),
    ).resolves.toMatchObject({ name: "阳光公寓", type: "rental", isDefault: false });

    expect(repository.createRental).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        name: "阳光公寓",
        createdByUserId: "user-1",
      },
      transaction,
    );
  });

  it("renames only an active rental ledger in the supplied organization", async () => {
    const { repository, service, transaction } = createHarness();

    await service.rename(
      { organizationId: "organization-1", id: "rental-ledger-1", name: "阳光公寓二期" },
      transaction as never,
    );

    expect(repository.renameActiveRental).toHaveBeenCalledWith(
      { organizationId: "organization-1", id: "rental-ledger-1", name: "阳光公寓二期" },
      transaction,
    );
  });

  it("blocks deleting a rental ledger referenced by any transaction history", async () => {
    const { repository, service, transaction } = createHarness();
    repository.hasAnyTransactionReference.mockResolvedValue(true);

    await expect(
      service.assertDeletable("organization-1", "rental-ledger-1", transaction as never),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.hasAnyTransactionReference).toHaveBeenCalledWith(
      "organization-1",
      "rental-ledger-1",
      transaction,
    );
    expect(repository.findActiveRental).toHaveBeenCalledWith(
      "organization-1",
      "rental-ledger-1",
      transaction,
    );
  });

  it("soft deletes an active rental ledger with the actor fields in the caller transaction", async () => {
    const { repository, service, transaction } = createHarness();

    await service.softDelete(
      { organizationId: "organization-1", id: "rental-ledger-1", actorUserId: "user-1" },
      transaction as never,
    );

    expect(repository.softDeleteActiveRental).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "rental-ledger-1",
        deletedByUserId: "user-1",
      },
      transaction,
    );
  });

  it.each([
    {
      title: "rename",
      configure: (repository: ReturnType<typeof createHarness>["repository"]) => {
        repository.renameActiveRental.mockResolvedValue(false);
      },
      invoke: (service: RentalLedgerBoundaryService, transaction: object) =>
        service.rename(
          { organizationId: "organization-1", id: "missing-ledger", name: "不可见" },
          transaction as never,
        ),
    },
    {
      title: "soft delete",
      configure: (repository: ReturnType<typeof createHarness>["repository"]) => {
        repository.softDeleteActiveRental.mockResolvedValue(false);
      },
      invoke: (service: RentalLedgerBoundaryService, transaction: object) =>
        service.softDelete(
          { organizationId: "organization-1", id: "missing-ledger", actorUserId: "user-1" },
          transaction as never,
        ),
    },
    {
      title: "deletability check",
      configure: (repository: ReturnType<typeof createHarness>["repository"]) => {
        repository.findActiveRental.mockResolvedValue(null);
      },
      invoke: (service: RentalLedgerBoundaryService, transaction: object) =>
        service.assertDeletable("organization-1", "missing-ledger", transaction as never),
    },
  ])("returns not found when the rental ledger is missing for $title", async ({
    configure,
    invoke,
  }) => {
    const { repository, service, transaction } = createHarness();
    configure(repository);

    await expect(invoke(service, transaction)).rejects.toBeInstanceOf(NotFoundException);
  });
});
