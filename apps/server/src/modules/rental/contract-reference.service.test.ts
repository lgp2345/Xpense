import { ConflictException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { ContractReferenceService } from "./contract-reference.service.js";
import { buildContractReferenceQuery } from "./contracts.queries.js";
import { buildSpaceLeaseStatusQuery, querySpaceLeaseStates } from "./space-lease-status.queries.js";

const executor = {
  kind: "transaction",
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
      })),
    })),
  })),
} as never;

function policyFakes() {
  return {
    properties: {
      assertCanDeactivate: vi.fn(() => {
        throw new ConflictException();
      }),
    },
    spaces: {
      assertCanDeactivate: vi.fn(() => {
        throw new ConflictException();
      }),
      assertCanMove: vi.fn(() => {
        throw new ConflictException();
      }),
    },
  };
}

function spaceRepositoryFakes() {
  return {
    listAncestors: vi.fn().mockResolvedValue([{ id: "space-1", name: "空间" }]),
    listDescendantIds: vi.fn().mockResolvedValue([]),
    listLeaseStates: vi.fn().mockResolvedValue(new Map()),
  };
}

describe("ContractReferenceService", () => {
  it("fails closed when organization date lookup has no select executor", async () => {
    const policies = policyFakes();
    const service = new ContractReferenceService(
      {} as never,
      {} as never,
      {} as never,
      policies.properties as never,
      policies.spaces as never,
    );

    await expect(service.organizationToday("org-1", {} as never)).rejects.toThrow(
      "Contract reference requires a database select executor",
    );
  });

  it("blocks a property with current or upcoming confirmed references", async () => {
    const repository = {
      findContractReferenceSummary: vi.fn().mockResolvedValue({
        own: true,
        descendant: false,
        oldAncestor: false,
        newAncestor: false,
      }),
    };
    const spacesRepository = spaceRepositoryFakes();
    const policies = policyFakes();
    const service = new ContractReferenceService(
      repository as never,
      spacesRepository as never,
      {} as never,
      policies.properties as never,
      policies.spaces as never,
    );

    await expect(
      service.assertPropertyCanDeactivate("org-1", "property-1", executor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.findContractReferenceSummary).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", propertyId: "property-1" }),
      executor,
    );
  });

  it("maps current before upcoming and keeps ancestor/descendant as blocking reasons", async () => {
    const repository = {
      findContractReferenceSummary: vi.fn().mockResolvedValue({
        own: true,
        descendant: true,
        oldAncestor: false,
        newAncestor: false,
      }),
    };
    const spacesRepository = spaceRepositoryFakes();
    const policies = policyFakes();
    const service = new ContractReferenceService(
      repository as never,
      spacesRepository as never,
      {} as never,
      policies.properties as never,
      policies.spaces as never,
    );

    await expect(
      service.assertSpaceCanDeactivate("org-1", "property-1", "space-1", executor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      ContractReferenceService.toLeaseState({
        hasOwnActive: true,
        hasOwnExpiringSoon: true,
        hasOwnUpcoming: true,
        hasAncestorCurrentOrUpcoming: true,
        hasDescendantCurrentOrUpcoming: true,
      }),
    ).toEqual({
      leaseStatus: "expiring_soon",
      leaseBlockedReason: null,
      hasUpcomingContract: true,
    });
  });

  it("returns ancestor blocking before descendant blocking for an own-vacant space", () => {
    expect(
      ContractReferenceService.toLeaseState({
        hasOwnActive: false,
        hasOwnExpiringSoon: false,
        hasOwnUpcoming: false,
        hasAncestorCurrentOrUpcoming: true,
        hasDescendantCurrentOrUpcoming: true,
      }),
    ).toEqual({
      leaseStatus: "vacant",
      leaseBlockedReason: "ancestor_contract",
      hasUpcomingContract: false,
    });
  });

  it("builds parameterized batch queries with actual end, lifecycle, and stable lock semantics", () => {
    const contractQuery = buildContractReferenceQuery({
      organizationId: "org-1",
      propertyId: "property-1",
      today: "2026-08-31",
      ownSpaceIds: ["space-1"],
      descendantSpaceIds: ["space-2"],
      oldAncestorSpaceIds: ["space-3"],
      newAncestorSpaceIds: ["space-4"],
    });
    const contractSql = new PgDialect().sqlToQuery(contractQuery as never);
    expect(contractSql.sql.toLowerCase()).toContain("coalesce");
    expect(contractSql.sql.toLowerCase()).toContain("for update");
    expect(contractSql.sql.toLowerCase()).toContain("status\" in ('confirmed', 'terminated')");
    expect(contractSql.params).toEqual(
      expect.arrayContaining(["org-1", "property-1", "2026-08-31"]),
    );

    const stateQuery = buildSpaceLeaseStatusQuery({
      organizationId: "org-1",
      propertyId: "property-1",
      spaceIds: ["space-1", "space-2", "space-3"],
      today: "2026-08-31",
    });
    const stateSql = new PgDialect().sqlToQuery(stateQuery as never);
    expect(stateSql.sql.toLowerCase()).toContain("any($");
    expect(stateSql.sql.toLowerCase()).toContain("with recursive");
    expect(stateSql.params).toEqual(expect.arrayContaining(["org-1", "property-1", "2026-08-31"]));
  });

  it("includes the root ancestor when deriving descendant blocking", () => {
    const sql = new PgDialect()
      .sqlToQuery(
        buildSpaceLeaseStatusQuery({
          organizationId: "org-1",
          propertyId: "property-1",
          spaceIds: ["leaf"],
          today: "2026-08-31",
        }) as never,
      )
      .sql.toLowerCase();
    expect(sql).toContain('select "ancestors"."requested_id", "parent"."id"');
    expect(sql).not.toContain('"parent"."parent_id" is not null');
  });

  it("passes the exact move impact set to the write protection repository", async () => {
    const repository = {
      findContractReferenceSummary: vi.fn().mockResolvedValue({
        own: false,
        descendant: false,
        oldAncestor: false,
        newAncestor: false,
      }),
    };
    const spacesRepository = {
      listAncestors: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "root-old", name: "旧根" },
          { id: "old-parent", name: "旧父" },
          { id: "space-1", name: "目标" },
        ])
        .mockResolvedValueOnce([
          { id: "root-new", name: "新根" },
          { id: "new-parent", name: "新父" },
        ]),
      listDescendantIds: vi.fn().mockResolvedValue(["child-1", "grandchild-1"]),
    };
    const policies = {
      properties: { assertCanDeactivate: vi.fn() },
      spaces: { assertCanDeactivate: vi.fn(), assertCanMove: vi.fn() },
    };
    const service = new ContractReferenceService(
      repository as never,
      spacesRepository as never,
      {} as never,
      policies.properties as never,
      policies.spaces as never,
    );

    await service.assertSpaceCanMove(
      "org-1",
      "property-1",
      "space-1",
      "old-parent",
      "new-parent",
      executor,
    );

    expect(repository.findContractReferenceSummary).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        propertyId: "property-1",
        today: expect.any(String),
        ownSpaceIds: ["space-1"],
        descendantSpaceIds: ["child-1", "grandchild-1"],
        oldAncestorSpaceIds: ["root-old", "old-parent"],
        newAncestorSpaceIds: ["root-new", "new-parent"],
      },
      executor,
    );
  });

  it("keeps page lease reads unlocked while reference protection locks contracts", () => {
    const readSql = new PgDialect()
      .sqlToQuery(
        buildSpaceLeaseStatusQuery({
          organizationId: "org-1",
          propertyId: "property-1",
          spaceIds: ["space-1"],
          today: "2026-08-31",
        }) as never,
      )
      .sql.toLowerCase();
    expect(readSql).not.toContain("for update");

    const writeSql = new PgDialect()
      .sqlToQuery(
        buildContractReferenceQuery({
          organizationId: "org-1",
          propertyId: "property-1",
          today: "2026-08-31",
          ownSpaceIds: ["space-1"],
        }) as never,
      )
      .sql.toLowerCase();
    expect(writeSql).toContain("for update");
    expect(writeSql.indexOf('order by "candidate"."id"')).toBeLessThan(
      writeSql.indexOf("for update"),
    );
  });

  it("fails closed when a page lease query has no execute executor", async () => {
    await expect(
      querySpaceLeaseStates(
        {
          organizationId: "org-1",
          propertyId: "property-1",
          spaceIds: ["space-1"],
          today: "2026-08-31",
        },
        {} as never,
      ),
    ).rejects.toThrow("Space lease status requires a database execute executor");
  });

  it("fails closed when the lease state repository capability is missing", async () => {
    const policies = policyFakes();
    const service = new ContractReferenceService(
      {} as never,
      {} as never,
      {} as never,
      policies.properties as never,
      policies.spaces as never,
    );

    await expect(
      Promise.resolve().then(() =>
        service.listSpaceLeaseStates("org-1", "property-1", ["space-1"], "2026-08-31", executor),
      ),
    ).rejects.toThrow("Contract reference requires a lease state repository");
  });
});
