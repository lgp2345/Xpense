import { describe, expect, it } from "vitest";
import { createBookkeepingTestState } from "./bookkeeping-test-state.js";
import {
  applyRentalMutationEffect,
  createRentalMutationFixtureRegistry,
  createRentalQueryFixtureRegistry,
} from "./rental-fake-query.js";
import { createRentalRepositoryFakes } from "./rental-fake-repositories.js";
import { createRentalTestState, rentalTestIds } from "./rental-test-state.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const contractId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000101";
const targetContractId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000102";

describe("RentalMutationFixtureRegistry", () => {
  it("supports an explicit resettable read sequence with defensive copies", () => {
    const registry = createRentalQueryFixtureRegistry();
    const args = [organizationId, contractId, "2026-08-31"];
    registry.registerReadSequence("contracts.detail", args, [
      { status: "confirmed", parties: [{ tenantId: rentalTestIds.tenant }] },
      { status: "confirmed", parties: [{ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000111" }] },
    ]);

    const before = registry.resolveRead<{ status: string; parties: Array<{ tenantId: string }> }>(
      "contracts.detail",
      args,
    );
    const after = registry.resolveRead<{ status: string; parties: Array<{ tenantId: string }> }>(
      "contracts.detail",
      args,
    );
    const firstParty = before.parties.at(0);
    if (!firstParty) throw new Error("Expected first read fixture party");
    firstParty.tenantId = "mutated";
    expect(after).toEqual({
      status: "confirmed",
      parties: [{ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000111" }],
    });

    registry.resetReadSequence("contracts.detail", args);
    expect(registry.resolveRead("contracts.detail", args)).toEqual({
      status: "confirmed",
      parties: [{ tenantId: rentalTestIds.tenant }],
    });
  });

  it("requires exact contract and relation mutation fixtures", () => {
    const registry = createRentalMutationFixtureRegistry();
    const contractInput = {
      organizationId,
      id: contractId,
      propertyId: rentalTestIds.property,
      externalContractNumber: null,
      startDate: "2026-09-15",
      endDate: "2026-12-31",
      rentAmountMinor: 10000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      note: "修正",
      updatedByUserId: organizationId,
    };
    expect(() =>
      registry.registerMutation(
        "contracts.updateHeader" as never,
        contractInput as never,
        {
          contract: { id: contractId, row: null },
        } as never,
      ),
    ).not.toThrow();
    expect(() =>
      registry.registerMutation(
        "relations.replaceDraftSpaces" as never,
        { organizationId, contractId, propertyId: rentalTestIds.property, spaces: [] } as never,
        { contractSpaces: { contractId, rows: [] } },
      ),
    ).not.toThrow();
    expect(() =>
      registry.resolveMutation(
        "contracts.setLifecycle" as never,
        {
          organizationId,
          id: contractId,
          status: "cancelled",
          updatedByUserId: organizationId,
          extra: "reject",
        } as never,
      ),
    ).toThrow("exact tuple");
  });

  it("requires explicit contract and update-lock read fixtures", async () => {
    const state = createRentalTestState();
    const readFixtures = createRentalQueryFixtureRegistry();
    const fakes = createRentalRepositoryFakes(
      state,
      createBookkeepingTestState(),
      readFixtures,
      createRentalMutationFixtureRegistry(),
    );
    await expect(
      fakes.contractsRepository.find?.(organizationId, rentalTestIds.contract, {} as never),
    ).rejects.toThrow("rental read fixture unavailable");
    await expect(
      fakes.propertiesRepository.findActiveOwnedForUpdate?.(
        organizationId,
        rentalTestIds.property,
        {} as never,
      ),
    ).rejects.toThrow("rental read fixture unavailable");
    await expect(
      fakes.spacesRepository.findActiveOwnedForUpdate?.(
        organizationId,
        rentalTestIds.property,
        rentalTestIds.childSpace,
        {} as never,
      ),
    ).rejects.toThrow("rental read fixture unavailable");
  });

  it("accepts the explicit tenant update mutation seam", () => {
    const registry = createRentalMutationFixtureRegistry();
    expect(() =>
      registry.registerMutation(
        "tenants.update" as never,
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000101",
          organizationId,
          type: "individual",
          name: "更新租户",
          phone: null,
          email: null,
          primaryContactName: null,
          primaryContactPhone: null,
          documentCountryCode: null,
          documentType: null,
          documentTypeOtherName: null,
          maskedDocumentNumber: null,
          documentNumberLookupHash: null,
          sensitiveIdentityCiphertext: null,
          sensitiveIdentityKeyVersion: null,
          isActive: true,
          note: null,
          updatedByUserId: "11111111-1111-4111-8111-111111111101",
        } as never,
        { tenant: { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000101", row: null } },
      ),
    ).not.toThrow();
  });

  it("requires exact fixtures for tenant scoped repository reads", async () => {
    const state = createRentalTestState();
    const tenants = createRentalRepositoryFakes(
      state,
      createBookkeepingTestState(),
      createRentalQueryFixtureRegistry(),
      createRentalMutationFixtureRegistry(),
    ).tenantsRepository;

    await expect(
      tenants.findActiveOwnedForUpdate?.(
        "11111111-1111-4111-8111-111111111111",
        rentalTestIds.tenant,
        {} as never,
      ),
    ).rejects.toThrow("rental read fixture unavailable");
    await expect(
      tenants.findDocumentConflict?.(
        "11111111-1111-4111-8111-111111111111",
        "fixed-document-hash",
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("rental read fixture unavailable");
    await expect(
      tenants.hasContractReference?.(
        "11111111-1111-4111-8111-111111111111",
        rentalTestIds.tenant,
        {} as never,
      ),
    ).rejects.toThrow("rental read fixture unavailable");
  });

  it("keeps tenant read fixtures independent from mutable rental state", async () => {
    const state = createRentalTestState();
    const readFixtures = createRentalQueryFixtureRegistry();
    readFixtures.registerRead(
      "tenants.findForUpdate",
      [organizationId, rentalTestIds.tenant],
      null,
    );
    readFixtures.registerRead("tenants.documentConflict", [organizationId, "hash", undefined], {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000199",
    });
    readFixtures.registerRead("tenants.reference", [organizationId, rentalTestIds.tenant], true);
    const tenants = createRentalRepositoryFakes(
      state,
      createBookkeepingTestState(),
      readFixtures,
      createRentalMutationFixtureRegistry(),
    ).tenantsRepository;

    state.tenants.clear();
    state.partyPeriods.clear();
    state.contracts.clear();
    await expect(
      tenants.findActiveOwnedForUpdate?.(organizationId, rentalTestIds.tenant, {} as never),
    ).resolves.toBeNull();
    await expect(
      tenants.findDocumentConflict?.(organizationId, "hash", undefined, {} as never),
    ).resolves.toEqual({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000199" });
    await expect(
      tenants.hasContractReference?.(organizationId, rentalTestIds.tenant, {} as never),
    ).resolves.toBe(true);
  });

  it("requires the complete method tuple and fails closed for mismatches", () => {
    const registry = createRentalMutationFixtureRegistry();
    const input = {
      organizationId,
      contractId,
      actualEnd: "2026-08-31",
    };
    registry.registerMutation("relations.clipPartyPeriodsToActualEnd", input, {
      partyPeriods: { contractId, rows: [] },
    });

    expect(registry.resolveMutation("relations.clipPartyPeriodsToActualEnd", input)).toEqual({
      partyPeriods: { contractId, rows: [] },
    });
    expect(() =>
      registry.resolveMutation("relations.clipPartyPeriodsToActualEnd", {
        ...input,
        extra: "reject",
      } as never),
    ).toThrow("exact tuple");
    expect(() =>
      registry.resolveMutation("relations.restoreTerminalPartyPeriods", input as never),
    ).toThrow("exact tuple");
    expect(() =>
      registry.resolveMutation("relations.copyTerminalPartySetToDraft", {
        organizationId,
        contractId,
        targetContractId,
        validFrom: "2027-01-01",
        validTo: "2027-02-01",
      }),
    ).toThrow("fixture unavailable");
  });

  it("defensively clones effects and applies explicit rows without reading source state", () => {
    const registry = createRentalMutationFixtureRegistry();
    const state = createRentalTestState();
    const party = {
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000101",
      tenantType: "individual" as const,
      tenantName: "固定租户",
      phone: "13800000009",
      email: "fixed@example.com",
      primaryContactName: null,
      primaryContactPhone: null,
      documentCountryCode: "CN",
      documentType: "national_id" as const,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: "2027-01-01",
      validTo: "2027-02-01",
      isPrimaryPayer: true,
      identitySnapshotCiphertext: Buffer.from("fixed-ciphertext"),
      identitySnapshotKeyVersion: 1,
    };
    const input = {
      organizationId,
      contractId,
      targetContractId,
      validFrom: "2027-01-01",
      validTo: "2027-02-01",
    };
    registry.registerMutation("relations.copyTerminalPartySetToDraft", input, {
      partyPeriods: { contractId: targetContractId, rows: [party] },
      counterEffects: { nextPartyPeriodId: 1 },
    });

    const first = registry.resolveMutation("relations.copyTerminalPartySetToDraft", input);
    const firstParty = first.partyPeriods?.rows?.[0];
    if (!firstParty) throw new Error("Expected explicit party fixture");
    firstParty.tenantName = "修改后的返回值";
    firstParty.identitySnapshotCiphertext?.fill(0);

    const second = registry.resolveMutation("relations.copyTerminalPartySetToDraft", input);
    expect(second.partyPeriods?.rows?.[0]).toMatchObject({ tenantName: "固定租户" });
    expect(second.partyPeriods?.rows?.[0]?.identitySnapshotCiphertext).toEqual(
      Buffer.from("fixed-ciphertext"),
    );

    const tenantBefore = state.tenants.get(party.tenantId);
    applyRentalMutationEffect(state, second);
    expect(state.partyPeriods.get(targetContractId)).toEqual([party]);
    expect(state.nextPartyPeriodId).toBe(2);
    expect(state.tenants.get(party.tenantId)).toBe(tenantBefore);
    expect(registry.mutationCalls).toHaveLength(2);
  });

  it("routes all four relation mutations through registered effects", async () => {
    const state = createRentalTestState();
    const registry = createRentalMutationFixtureRegistry();
    const relations = createRentalRepositoryFakes(
      state,
      createBookkeepingTestState(),
      createRentalQueryFixtureRegistry(),
      registry,
    ).contractRelationsRepository;
    const executor = {} as never;
    const party = {
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000111",
      tenantType: "individual" as const,
      tenantName: "显式关系",
      phone: null,
      email: null,
      primaryContactName: null,
      primaryContactPhone: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: "2027-01-01",
      validTo: "2027-02-01",
      isPrimaryPayer: true,
      identitySnapshotCiphertext: null,
      identitySnapshotKeyVersion: null,
    };
    const space = {
      spaceId: "99999999-9999-4999-8999-000000000111",
      spaceName: "显式空间",
      spaceCode: null,
      spacePath: [],
      rentAllocationMinor: null,
    };

    registry.registerMutation(
      "relations.confirmSnapshots",
      { organizationId, contractId },
      {
        contractSpaces: { contractId, rows: [space] },
        partyPeriods: { contractId, rows: [party] },
        deposits: { contractId, rows: [] },
        snapshots: {
          contractId,
          row: { contractId, spaces: [space], parties: [party], deposits: [] },
        },
      },
    );
    registry.registerMutation(
      "relations.clipPartyPeriodsToActualEnd",
      { organizationId, contractId, actualEnd: "2027-01-15" },
      { partyPeriods: { contractId, rows: [{ ...party, validTo: "2027-01-15" }] } },
    );
    registry.registerMutation(
      "relations.restoreTerminalPartyPeriods",
      { organizationId, contractId, terminatedAt: "2027-01-15", originalEnd: "2027-02-01" },
      { partyPeriods: { contractId, rows: [{ ...party, validTo: "2027-02-01" }] } },
    );
    registry.registerMutation(
      "relations.copyTerminalPartySetToDraft",
      {
        organizationId,
        contractId,
        targetContractId,
        validFrom: "2027-03-01",
        validTo: "2027-04-01",
      },
      {
        partyPeriods: {
          contractId: targetContractId,
          rows: [{ ...party, validFrom: "2027-03-01", validTo: "2027-04-01" }],
        },
        counterEffects: { nextPartyPeriodId: 1 },
      },
    );

    await relations.confirmSnapshots?.({ organizationId, contractId }, executor);
    await relations.clipPartyPeriodsToActualEnd?.(
      { organizationId, contractId, actualEnd: "2027-01-15" },
      executor,
    );
    await relations.restoreTerminalPartyPeriods?.(
      { organizationId, contractId, terminatedAt: "2027-01-15", originalEnd: "2027-02-01" },
      executor,
    );
    await relations.copyTerminalPartySetToDraft?.(
      {
        organizationId,
        contractId,
        targetContractId,
        validFrom: "2027-03-01",
        validTo: "2027-04-01",
      },
      executor,
    );

    expect(state.contractSpaces.get(contractId)).toEqual([space]);
    expect(state.partyPeriods.get(contractId)).toEqual([{ ...party, validTo: "2027-02-01" }]);
    expect(state.partyPeriods.get(targetContractId)).toEqual([
      { ...party, validFrom: "2027-03-01", validTo: "2027-04-01" },
    ]);
    expect(state.snapshots.get(contractId)).toEqual({
      contractId,
      spaces: [space],
      parties: [party],
      deposits: [],
    });
    expect(state.nextPartyPeriodId).toBe(2);
    expect(registry.mutationCalls).toHaveLength(4);
  });

  it("uses explicit party-period and change effects without deriving rows from state", async () => {
    const state = createRentalTestState();
    const registry = createRentalMutationFixtureRegistry();
    const relations = createRentalRepositoryFakes(
      state,
      createBookkeepingTestState(),
      createRentalQueryFixtureRegistry(),
      registry,
    ).contractRelationsRepository;
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000111";
    const effectiveDate = "2026-09-01";
    const party = {
      tenantId,
      tenantType: "individual" as const,
      tenantName: "显式变更租户",
      phone: null,
      email: null,
      primaryContactName: null,
      primaryContactPhone: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: effectiveDate,
      validTo: "2026-12-31",
      isPrimaryPayer: true,
      identitySnapshotCiphertext: null,
      identitySnapshotKeyVersion: null,
    };
    const replaceInput = {
      organizationId,
      contractId,
      effectiveDate,
      parties: [
        {
          tenantId,
          isPrimaryPayer: true,
        },
      ],
    };
    const changeInput = {
      organizationId,
      contractId,
      type: "parties_changed" as const,
      effectiveDate,
      reason: "固定变更原因",
      beforePartyRefs: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
      afterPartyRefs: [{ tenantId, isPrimaryPayer: true }],
      createdByUserId: organizationId,
    };
    const change = {
      id: "cccccccc-cccc-4ccc-8ccc-000000000111",
      organizationId,
      contractId,
      type: "parties_changed" as const,
      effectiveDate,
      reason: "固定变更原因",
      beforePartyRefs: changeInput.beforePartyRefs,
      afterPartyRefs: changeInput.afterPartyRefs,
      createdByUserId: organizationId,
    };
    registry.registerMutation("relations.replacePartyPeriods", replaceInput, {
      partyPeriods: { contractId, rows: [party] },
      counterEffects: { nextPartyPeriodId: 1 },
    });
    registry.registerMutation("relations.appendChange", changeInput, {
      changes: { contractId, rows: [change] },
      counterEffects: { nextChangeId: 1 },
    });

    state.partyPeriods.set(contractId, [
      { ...party, tenantId: rentalTestIds.tenant, tenantName: "状态中的旧租户" },
    ]);
    state.changes.set(contractId, []);
    const beforeTenant = state.tenants.get(tenantId);
    await relations.replacePartyPeriods?.(replaceInput, {} as never);
    await relations.appendChange?.(changeInput, {} as never);

    expect(state.partyPeriods.get(contractId)).toEqual([party]);
    expect(state.changes.get(contractId)).toEqual([change]);
    expect(state.nextPartyPeriodId).toBe(2);
    expect(state.nextChangeId).toBe(2);
    expect(state.tenants.get(tenantId)).toBe(beforeTenant);
    expect(registry.mutationCalls.map(({ method }) => method)).toEqual([
      "relations.replacePartyPeriods",
      "relations.appendChange",
    ]);
  });
});
