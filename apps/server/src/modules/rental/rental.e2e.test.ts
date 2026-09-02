import { describe, expect, it } from "vitest";

import { testIds } from "../../test/auth-test-helpers.js";
import {
  cloneRentalTestState,
  createRentalTestState,
  rentalTestIds,
  restoreRentalTestState,
} from "../../test/rental-test-harness.js";

describe("Rental HTTP e2e compatibility", () => {
  it("deep clones and restores rental relation state without aliases", () => {
    const state = createRentalTestState();
    const contractId = rentalTestIds.contract;
    state.changes.set(contractId, [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001",
        organizationId: testIds.organization,
        contractId,
        type: "parties_changed",
        effectiveDate: "2026-09-01",
        reason: "固定测试变更",
        beforePartyRefs: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: false }],
        afterPartyRefs: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
        createdByUserId: testIds.ownerUser,
      },
    ]);
    state.deposits.set(contractId, [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddd0001",
        type: "rental",
        customName: null,
        calculationMode: "fixed_amount",
        fixedAmountMinor: 0,
        rentMultiple: null,
        finalAmountMinor: null,
        sortOrder: 0,
      },
    ]);
    state.actions.set(contractId, [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffff0001",
        organizationId: testIds.organization,
        contractId,
        type: "termination_revoked",
        reason: "固定测试动作",
        terminationDateBeforeRevoke: "2026-10-01",
        createdByUserId: testIds.ownerUser,
      },
    ]);
    state.snapshots.set(contractId, {
      contractId,
      spaces: state.contractSpaces.get(contractId)?.map((space) => ({ ...space })) ?? [],
      parties: state.partyPeriods.get(contractId)?.map((party) => ({ ...party })) ?? [],
      deposits: state.deposits.get(contractId)?.map((deposit) => ({ ...deposit })) ?? [],
    });
    state.auditEntries.push({
      action: "rental_test",
      targetId: contractId,
      metadata: {
        nested: { date: new Date("2026-08-31T00:00:00.000Z"), bytes: Buffer.from([1, 2]) },
      },
    });
    const snapshot = cloneRentalTestState(state);
    const restoreSnapshot = cloneRentalTestState(state);
    const liveSpaces = state.contractSpaces.get(contractId);
    const liveParties = state.partyPeriods.get(contractId);
    const liveChangeRows = state.changes.get(contractId);
    const liveActionRows = state.actions.get(contractId);
    const liveDepositRows = state.deposits.get(contractId);
    const liveSnapshot = state.snapshots.get(contractId);
    const liveProperties = state.properties;
    const liveSpaceRecords = state.spaces;
    const liveTenants = state.tenants;
    const liveContracts = state.contracts;
    const liveContractSpaces = state.contractSpaces;
    const livePartyPeriods = state.partyPeriods;
    const liveChangeMap = state.changes;
    const liveActionMap = state.actions;
    const liveDepositMap = state.deposits;
    const liveSnapshots = state.snapshots;
    const liveCounters = state.contractCounters;
    const liveSnapshotSpaces = liveSnapshot?.spaces;
    const liveSnapshotParties = liveSnapshot?.parties;
    const liveSnapshotDeposits = liveSnapshot?.deposits;
    const liveAuditEntries = state.auditEntries;
    const tenant = state.tenants.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01");
    expect(tenant).toBeDefined();
    if (!tenant) return;
    tenant.sensitiveIdentityCiphertext?.fill(0);
    tenant.createdAt.setUTCFullYear(2030);
    const property = state.properties.get(rentalTestIds.property);
    if (property) property.name = "live-property";
    const parentSpace = state.spaces.get(rentalTestIds.parentSpace);
    if (parentSpace) parentSpace.name = "live-space";
    const contract = state.contracts.get(contractId);
    expect(contract).toBeDefined();
    if (!contract) return;
    contract.note = "live-contract";
    state.contractCounters.set("counter/live", 99);
    const liveSpacePath = state.contractSpaces.get(contract.id)?.[0]?.spacePath[0];
    if (liveSpacePath) liveSpacePath.name = "changed";
    const change = state.changes.get(contractId)?.[0];
    const beforeParty = change?.beforePartyRefs[0];
    if (beforeParty) beforeParty.isPrimaryPayer = true;
    const deposit = state.deposits.get(contractId)?.[0];
    if (deposit) deposit.fixedAmountMinor = 99;
    const auditMetadata = state.auditEntries[0]?.metadata as {
      nested: { date: Date; bytes: Buffer };
    };
    auditMetadata.nested.date.setUTCFullYear(2030);
    auditMetadata.nested.bytes.fill(9);
    expect(
      snapshot.tenants
        .get(tenant.id)
        ?.sensitiveIdentityCiphertext?.equals(
          tenant.sensitiveIdentityCiphertext ?? Buffer.alloc(0),
        ),
    ).toBe(false);
    expect(snapshot.tenants.get(tenant.id)?.createdAt.getUTCFullYear()).toBe(2026);
    expect(snapshot.properties.get(rentalTestIds.property)?.name).toBe("测试房产");
    expect(snapshot.spaces.get(rentalTestIds.parentSpace)?.name).toBe("测试楼栋");
    expect(snapshot.contracts.get(contractId)?.note).toBeNull();
    expect(snapshot.contractCounters.has("counter/live")).toBe(false);
    expect(snapshot.contractSpaces.get(contract.id)?.[0]?.spacePath[0]?.name).not.toBe("changed");
    expect(snapshot.changes.get(contractId)?.[0]?.beforePartyRefs[0]?.isPrimaryPayer).toBe(false);
    expect(snapshot.deposits.get(contractId)?.[0]?.fixedAmountMinor).toBe(0);
    expect(
      (
        snapshot.auditEntries[0]?.metadata as { nested: { date: Date; bytes: Buffer } }
      ).nested.date.getUTCFullYear(),
    ).toBe(2026);
    expect(
      (snapshot.auditEntries[0]?.metadata as { nested: { date: Date; bytes: Buffer } }).nested
        .bytes,
    ).toEqual(Buffer.from([1, 2]));

    const snapshotTenant = snapshot.tenants.get(tenant.id);
    if (snapshotTenant) snapshotTenant.name = "snapshot-only";
    expect(state.tenants.get(tenant.id)?.name).not.toBe("snapshot-only");
    snapshot.tenants.delete(tenant.id);
    expect(state.tenants.has(tenant.id)).toBe(true);
    const snapshotProperty = snapshot.properties.get(rentalTestIds.property);
    if (snapshotProperty) snapshotProperty.name = "snapshot-only";
    expect(state.properties.get(rentalTestIds.property)?.name).toBe("live-property");
    const snapshotSpaceRecord = snapshot.spaces.get(rentalTestIds.parentSpace);
    if (snapshotSpaceRecord) snapshotSpaceRecord.name = "snapshot-only";
    expect(state.spaces.get(rentalTestIds.parentSpace)?.name).toBe("live-space");
    const snapshotContract = snapshot.contracts.get(contractId);
    if (snapshotContract) snapshotContract.note = "snapshot-only";
    expect(state.contracts.get(contractId)?.note).toBe("live-contract");
    snapshot.contractCounters.set("counter/snapshot", 7);
    expect(state.contractCounters.has("counter/snapshot")).toBe(false);
    const snapshotSpace = snapshot.contractSpaces.get(contractId)?.[0];
    if (snapshotSpace) snapshotSpace.spaceName = "snapshot-only";
    expect(state.contractSpaces.get(contractId)?.[0]?.spaceName).not.toBe("snapshot-only");
    const snapshotParty = snapshot.partyPeriods.get(contractId)?.[0];
    if (snapshotParty) snapshotParty.isPrimaryPayer = false;
    expect(state.partyPeriods.get(contractId)?.[0]?.isPrimaryPayer).toBe(true);
    const snapshotChange = snapshot.changes.get(contractId)?.[0];
    if (snapshotChange) snapshotChange.reason = "snapshot-only";
    expect(state.changes.get(contractId)?.[0]?.reason).toBe("固定测试变更");
    const liveAction = state.actions.get(contractId)?.[0];
    if (liveAction) liveAction.reason = "live-only";
    expect(snapshot.actions.get(contractId)?.[0]?.reason).toBe("固定测试动作");
    const snapshotDeposit = snapshot.deposits.get(contractId)?.[0];
    if (snapshotDeposit) snapshotDeposit.fixedAmountMinor = 7;
    expect(state.deposits.get(contractId)?.[0]?.fixedAmountMinor).toBe(99);
    const snapshotAction = snapshot.actions.get(contractId)?.[0];
    if (snapshotAction) snapshotAction.reason = "snapshot-only";
    expect(state.actions.get(contractId)?.[0]?.reason).toBe("live-only");
    const snapshotAudit = snapshot.auditEntries[0];
    if (snapshotAudit) snapshotAudit.metadata = { changed: true };
    expect(state.auditEntries[0]?.metadata).not.toEqual({ changed: true });
    const snapshotRecord = snapshot.snapshots.get(contractId);
    if (snapshotRecord) {
      const snapshotRecordSpace = snapshotRecord.spaces[0];
      if (snapshotRecordSpace) snapshotRecordSpace.spaceName = "snapshot-only";
      const snapshotRecordParty = snapshotRecord.parties[0];
      if (snapshotRecordParty) snapshotRecordParty.isPrimaryPayer = false;
      const snapshotRecordDeposit = snapshotRecord.deposits[0];
      if (snapshotRecordDeposit) snapshotRecordDeposit.fixedAmountMinor = 7;
    }
    expect(state.snapshots.get(contractId)?.spaces[0]?.spaceName).not.toBe("snapshot-only");
    expect(state.snapshots.get(contractId)?.parties[0]?.isPrimaryPayer).toBe(true);
    expect(state.snapshots.get(contractId)?.deposits[0]?.fixedAmountMinor).toBe(0);

    state.tenants.clear();
    state.nextTenantId = 99;
    restoreRentalTestState(state, restoreSnapshot);
    expect(state.tenants.get(tenant.id)?.name).toBe(restoreSnapshot.tenants.get(tenant.id)?.name);
    expect(state.nextTenantId).toBe(restoreSnapshot.nextTenantId);
    expect(state.tenants.get(tenant.id)).not.toBe(restoreSnapshot.tenants.get(tenant.id));
    expect(state.contractSpaces.get(contractId)).toBe(liveSpaces);
    expect(state.partyPeriods.get(contractId)).toBe(liveParties);
    expect(state.changes.get(contractId)).toBe(liveChangeRows);
    expect(state.actions.get(contractId)).toBe(liveActionRows);
    expect(state.deposits.get(contractId)).toBe(liveDepositRows);
    expect(state.snapshots.get(contractId)).toBe(liveSnapshot);
    expect(state.snapshots.get(contractId)?.spaces).toBe(liveSnapshotSpaces);
    expect(state.snapshots.get(contractId)?.parties).toBe(liveSnapshotParties);
    expect(state.snapshots.get(contractId)?.deposits).toBe(liveSnapshotDeposits);
    expect(state.auditEntries).toBe(liveAuditEntries);
    expect(state.properties).toBe(liveProperties);
    expect(state.spaces).toBe(liveSpaceRecords);
    expect(state.tenants).toBe(liveTenants);
    expect(state.contracts).toBe(liveContracts);
    expect(state.contractSpaces).toBe(liveContractSpaces);
    expect(state.partyPeriods).toBe(livePartyPeriods);
    expect(state.changes).toBe(liveChangeMap);
    expect(state.actions).toBe(liveActionMap);
    expect(state.deposits).toBe(liveDepositMap);
    expect(state.snapshots).toBe(liveSnapshots);
    expect(state.contractCounters).toBe(liveCounters);
  });
});
