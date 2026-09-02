import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  rentalContractChanges,
  rentalContractDepositTerms,
  rentalContractPartyPeriods,
  rentalContractSpaces,
} from "../../db/schema.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function compileSql(value: Parameters<PgDialect["sqlToQuery"]>[0]) {
  return new PgDialect().sqlToQuery(value);
}

function createReplacementExecutor() {
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockReturnValue({ where: deleteWhere });
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  return { deleteWhere, delete: remove, values, insert };
}

describe("ContractRelationsRepository draft replacements", () => {
  it("deletes and inserts spaces, parties, and deposits only in the supplied organization scope", async () => {
    const executor = createReplacementExecutor();
    const repository = new ContractRelationsRepository();

    await repository.replaceDraftSpaces(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        propertyId: "property-1",
        spaces: [{ spaceId: "space-1", rentAllocationMinor: 100_000 }],
      },
      executor as never,
    );
    await repository.replaceDraftParties(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
      },
      executor as never,
    );
    await repository.replaceDraftDeposits(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        deposits: [
          {
            type: "rental",
            customName: null,
            calculationMode: "rent_multiple",
            fixedAmountMinor: null,
            rentMultiple: "2.0000",
            sortOrder: 0,
          },
        ],
      },
      executor as never,
    );

    expect(executor.delete.mock.calls.map(([table]) => table)).toEqual([
      rentalContractSpaces,
      rentalContractPartyPeriods,
      rentalContractDepositTerms,
    ]);
    for (const [condition] of executor.deleteWhere.mock.calls) {
      const query = compileSql(condition);
      expect(query.params).toEqual(expect.arrayContaining(["organization-1", "contract-1"]));
      expect(normalizeSql(query.sql)).toContain('"organization_id" = $');
      expect(normalizeSql(query.sql)).toContain('"contract_id" = $');
    }
    expect(executor.insert.mock.calls.map(([table]) => table)).toEqual([
      rentalContractSpaces,
      rentalContractPartyPeriods,
      rentalContractDepositTerms,
    ]);
    expect(executor.values.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        organizationId: "organization-1",
        contractId: "contract-1",
        propertyId: "property-1",
        spaceId: "space-1",
      }),
    ]);
    expect(executor.values.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({
        organizationId: "organization-1",
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: null,
        validTo: null,
      }),
    ]);
    expect(executor.values.mock.calls[2]?.[0]).toEqual([
      expect.objectContaining({
        organizationId: "organization-1",
        contractId: "contract-1",
        finalAmountMinor: null,
      }),
    ]);
  });

  it("does not issue an invalid insert when a draft relation collection is empty", async () => {
    const executor = createReplacementExecutor();
    const repository = new ContractRelationsRepository();

    await repository.replaceDraftSpaces(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        propertyId: "property-1",
        spaces: [],
      },
      executor as never,
    );

    expect(executor.delete).toHaveBeenCalledWith(rentalContractSpaces);
    expect(executor.insert).not.toHaveBeenCalled();
  });
});

describe("ContractRelationsRepository snapshots and changes", () => {
  it("appends a fixed typed termination revocation action without accepting arbitrary types", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const repository = new ContractRelationsRepository();
    const append = (
      repository as unknown as {
        appendTerminationRevocation: (input: unknown, executor: unknown) => Promise<void>;
      }
    ).appendTerminationRevocation.bind(repository);

    await append(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        reason: "恢复租期",
        terminationDateBeforeRevoke: "2026-08-15",
        createdByUserId: "user-1",
      },
      { insert } as never,
    );

    expect(insert).toHaveBeenCalledWith(expect.anything());
    expect(values).toHaveBeenCalledWith({
      organizationId: "organization-1",
      contractId: "contract-1",
      type: "termination_revoked",
      reason: "恢复租期",
      terminationDateBeforeRevoke: "2026-08-15",
      createdByUserId: "user-1",
    });
  });

  it("appends repeated revocation actions without overwriting prior reasons", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const repository = new ContractRelationsRepository();

    await repository.appendTerminationRevocation(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        reason: "第一次恢复",
        terminationDateBeforeRevoke: "2026-08-15",
        createdByUserId: "user-1",
      },
      { insert } as never,
    );
    await repository.appendTerminationRevocation(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        reason: "第二次恢复",
        terminationDateBeforeRevoke: "2026-09-15",
        createdByUserId: "user-1",
      },
      { insert } as never,
    );

    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({ reason: "第一次恢复", type: "termination_revoked" }),
      expect.objectContaining({ reason: "第二次恢复", type: "termination_revoked" }),
    ]);
  });

  it("freezes renewed tenant identity snapshots without overwriting existing snapshots", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const repository = new ContractRelationsRepository();

    await repository.confirmSnapshots(
      { organizationId: "organization-1", contractId: "contract-1" },
      { execute } as never,
    );

    expect(execute).toHaveBeenCalledTimes(3);
    const statements = execute.mock.calls.map(([statement]) => compileSql(statement));
    const sql = statements.map((statement) => normalizeSql(statement.sql));
    expect(sql[0]).toContain("with recursive");
    expect(sql[0]).toContain('"space_tree"');
    expect(sql[0]).toContain('"tree"."depth" < $');
    expect(sql[0]).toContain('"space_name_snapshot"');
    expect(sql[0]).toContain('"space_path_snapshot"');
    expect(sql[1]).toContain('"tenant_name_snapshot"');
    expect(sql[1]).toContain('"masked_document_number_snapshot"');
    expect(sql[1]).toContain('"identity_snapshot_ciphertext"');
    expect(sql[1]).toContain('"valid_from" = "contract"."start_date"');
    expect(sql[1]).toContain('"valid_to" = "contract"."end_date"');
    expect(sql[1]).toContain('"period"."tenant_name_snapshot" is null');
    expect(sql[1]).not.toContain('"contract"."renewed_from_contract_id" is null');
    expect(sql[2]).toContain('"final_amount_minor"');
    expect(sql[2]).toContain("round(");
    for (const statement of statements) {
      expect(statement.params).toEqual(expect.arrayContaining(["organization-1", "contract-1"]));
    }
  });

  it("closes prior party periods, inserts frozen replacements, and appends a scoped audit change", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const repository = new ContractRelationsRepository();
    const executor = { execute, insert } as never;

    await repository.replacePartyPeriods(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        effectiveDate: "2026-10-01",
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      },
      executor,
    );
    await repository.appendChange(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        type: "parties_changed",
        effectiveDate: "2026-10-01",
        reason: "承租方变更",
        beforePartyRefs: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
        afterPartyRefs: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
        createdByUserId: "user-1",
      },
      executor,
    );

    expect(execute).toHaveBeenCalledTimes(3);
    const close = compileSql(execute.mock.calls[1]?.[0]);
    const replacement = compileSql(execute.mock.calls[2]?.[0]);
    expect(normalizeSql(close.sql)).toContain('update "rental_contract_party_periods"');
    expect(normalizeSql(close.sql)).toMatch(/"valid_to" = \$\d+::date - 1/);
    expect(close.params).toEqual(
      expect.arrayContaining(["organization-1", "contract-1", "2026-10-01"]),
    );
    expect(normalizeSql(replacement.sql)).toContain('insert into "rental_contract_party_periods"');
    expect(normalizeSql(replacement.sql)).toContain('"tenant_name_snapshot"');
    expect(normalizeSql(replacement.sql)).toContain('"masked_document_number_snapshot"');
    expect(normalizeSql(replacement.sql)).toContain('"contract"."end_date"');
    expect(replacement.params).toEqual(
      expect.arrayContaining(["organization-1", "contract-1", "2026-10-01", "tenant-2", true]),
    );
    expect(insert).toHaveBeenCalledWith(rentalContractChanges);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "organization-1", contractId: "contract-1" }),
    );
  });

  it("removes same-day and future periods before replacing a prior period through the actual end date", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const repository = new ContractRelationsRepository();

    await repository.replacePartyPeriods(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        effectiveDate: "2026-01-01",
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      },
      { execute } as never,
    );

    expect(execute).toHaveBeenCalledTimes(3);
    const [removeFuture, closePrior, replacement] = execute.mock.calls.map(([statement]) =>
      normalizeSql(compileSql(statement).sql),
    );
    expect(removeFuture).toContain('delete from "rental_contract_party_periods"');
    expect(removeFuture).toMatch(/"valid_from" >= \$\d+::date/);
    expect(closePrior).toContain('update "rental_contract_party_periods"');
    expect(closePrior).toMatch(/"valid_from" < \$\d+::date/);
    expect(replacement).toContain('coalesce("contract"."termination_date", "contract"."end_date")');
  });

  it("clips party periods to actual end by deleting future rows and capping overlapping rows", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const repository = new ContractRelationsRepository();

    await repository.clipPartyPeriodsToActualEnd(
      { organizationId: "organization-1", contractId: "contract-1", actualEnd: "2026-08-15" },
      { execute } as never,
    );

    expect(execute).toHaveBeenCalledTimes(2);
    const statements = execute.mock.calls.map(([statement]) => compileSql(statement));
    const removeFuture = statements.at(0);
    const capOverlapping = statements.at(1);
    if (!removeFuture || !capOverlapping) throw new Error("expected clipping SQL statements");
    expect(normalizeSql(removeFuture.sql)).toContain('delete from "rental_contract_party_periods"');
    expect(normalizeSql(removeFuture.sql)).toMatch(/"valid_from" > \$\d+::date/);
    expect(normalizeSql(capOverlapping.sql)).toContain('update "rental_contract_party_periods"');
    expect(normalizeSql(capOverlapping.sql)).toMatch(/"valid_to" = \$\d+::date/);
    for (const statement of statements) {
      expect(statement.params).toEqual(
        expect.arrayContaining(["organization-1", "contract-1", "2026-08-15"]),
      );
    }
  });

  it("restores only the complete terminal cohort to the original end", async () => {
    const execute = vi.fn().mockResolvedValue([{ id: "period-1" }]);
    const repository = new ContractRelationsRepository();

    await repository.restoreTerminalPartyPeriods(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        terminatedAt: "2026-08-15",
        originalEnd: "2026-12-31",
      },
      { execute } as never,
    );

    const statement = compileSql(execute.mock.calls[0]?.[0]);
    expect(normalizeSql(statement.sql)).toContain('with "terminal_period" as');
    expect(normalizeSql(statement.sql)).toContain('max("valid_from")');
    expect(normalizeSql(statement.sql)).toContain('"valid_to" = $');
    expect(statement.params).toEqual(
      expect.arrayContaining(["organization-1", "contract-1", "2026-08-15", "2026-12-31"]),
    );
  });

  it("copies terminal encrypted snapshots opaquely into a rebased draft cohort", async () => {
    const execute = vi.fn().mockResolvedValue([{ tenantId: "tenant-1" }]);
    const repository = new ContractRelationsRepository();

    await repository.copyTerminalPartySetToDraft(
      {
        organizationId: "organization-1",
        contractId: "contract-1",
        targetContractId: "draft-1",
        validFrom: "2027-01-01",
        validTo: "2027-12-31",
      },
      { execute } as never,
    );

    const statement = compileSql(execute.mock.calls[0]?.[0]);
    expect(normalizeSql(statement.sql)).toContain('insert into "rental_contract_party_periods"');
    expect(normalizeSql(statement.sql)).toContain('"identity_snapshot_ciphertext"');
    expect(normalizeSql(statement.sql)).toContain('"masked_document_number_snapshot"');
    expect(normalizeSql(statement.sql)).toContain('max("candidate"."valid_from")');
    expect(statement.params).toEqual(
      expect.arrayContaining([
        "organization-1",
        "contract-1",
        "draft-1",
        "2027-01-01",
        "2027-12-31",
      ]),
    );
  });
});
