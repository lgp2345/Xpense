import { LedgersRepository } from "../modules/bookkeeping/ledgers.repository.js";
import { ContractRelationsRepository } from "../modules/rental/contract-relations.repository.js";
import { ContractsRepository } from "../modules/rental/contracts.repository.js";
import { PropertiesRepository } from "../modules/rental/properties.repository.js";
import type { CreateRentalPropertyInput } from "../modules/rental/properties.repository.types.js";
import { SpacesRepository } from "../modules/rental/spaces.repository.js";
import type { CreateRentalSpaceInput } from "../modules/rental/spaces.repository.types.js";
import { TenantsRepository } from "../modules/rental/tenants.repository.js";
import type { BookkeepingTestState } from "./bookkeeping-test-state.js";
import {
  applyRentalMutationEffect,
  type RentalContractNumberFixture,
  type RentalMutationFixtureRegistry,
  type RentalQueryFixtureRegistry,
} from "./rental-fake-query.js";
import {
  createContractRecord,
  createPropertyRecord,
  createSpaceRecord,
  createTenantRecord,
  FIXED_RENTAL_NOW,
  nextUuid,
  RentalTestState,
} from "./rental-test-state.js";

export function createRentalRepositoryFakes(
  state: RentalTestState,
  bookkeeping: BookkeepingTestState,
  readFixtures: RentalQueryFixtureRegistry,
  mutationFixtures: RentalMutationFixtureRegistry,
) {
  const fakes = {
    propertiesRepository: createPropertiesRepository(state, readFixtures),
    spacesRepository: createSpacesRepository(state, readFixtures),
    tenantsRepository: createTenantsRepository(state, readFixtures, mutationFixtures),
    contractsRepository: createContractsRepository(state, readFixtures, mutationFixtures),
    contractRelationsRepository: createContractRelationsRepository(state, mutationFixtures),
    extendLedgersRepository: (repository: Partial<LedgersRepository>) =>
      Object.assign(repository, createRentalLedgersRepository(state, bookkeeping)),
  };
  assertRepositoryCapabilities("properties", fakes.propertiesRepository, [
    "list",
    "findActiveOwned",
    "findActiveOwnedForUpdate",
    "findActiveNameConflict",
    "create",
    "update",
    "setStatus",
    "hasActiveSpace",
    "softDelete",
  ]);
  assertRepositoryCapabilities("spaces", fakes.spacesRepository, [
    "listChildren",
    "search",
    "findActiveOwned",
    "findActiveOwnedById",
    "findActiveOwnedForUpdate",
    "listAncestors",
    "listDescendantIds",
    "listLeaseStates",
    "getSubtreeRelativeDepth",
    "hasActiveChildren",
    "hasAnyChildren",
    "findSiblingConflicts",
    "create",
    "createMany",
    "update",
    "move",
    "setStatus",
    "softDelete",
  ]);
  assertRepositoryCapabilities("tenants", fakes.tenantsRepository, [
    "list",
    "findActiveOwned",
    "findActiveOwnedForUpdate",
    "findDocumentConflict",
    "create",
    "update",
    "setStatus",
    "hasContractReference",
    "softDelete",
  ]);
  assertRepositoryCapabilities("contracts", fakes.contractsRepository, [
    "list",
    "detail",
    "find",
    "findForUpdate",
    "findContractReferenceSummary",
    "countPropertyContracts",
    "nextContractNumber",
    "createDraft",
    "updateHeader",
    "setLifecycle",
    "softDelete",
  ]);
  assertRepositoryCapabilities("contract-relations", fakes.contractRelationsRepository, [
    "findPartySensitiveSnapshot",
    "replaceDraftSpaces",
    "replaceDraftParties",
    "replaceDraftDeposits",
    "confirmSnapshots",
    "replacePartyPeriods",
    "clipPartyPeriodsToActualEnd",
    "restoreTerminalPartyPeriods",
    "copyTerminalPartySetToDraft",
    "appendChange",
    "appendTerminationRevocation",
  ]);
  return fakes;
}

function assertRepositoryCapabilities(
  name: string,
  repository: object,
  methods: readonly string[],
): void {
  for (const method of methods) {
    if (typeof (repository as Record<string, unknown>)[method] !== "function") {
      throw new Error(`Rental test repository capability unavailable: ${name}.${method}`);
    }
  }
}

/** 提供租赁模块读取组织日期与执行批量引用查询所需的完整数据库能力。 */

function consumeRepositoryFailure(
  state: RentalTestState,
  operation: string,
  phase: "before" | "after" = "before",
): void {
  if (
    state.failNextRepositoryOperation !== operation ||
    (state.failNextRepositoryOperationPhase ?? "before") !== phase
  )
    return;
  state.failNextRepositoryOperation = null;
  state.failNextRepositoryOperationPhase = null;
  throw new Error(`Rental test repository failure: ${operation}`);
}

function createTenantsRepository(
  state: RentalTestState,
  readFixtures: RentalQueryFixtureRegistry,
  mutationFixtures: RentalMutationFixtureRegistry,
): Partial<TenantsRepository> {
  return {
    list: async (organizationId, input) =>
      readFixtures.resolveRead("tenants.list", [organizationId, input]),
    findActiveOwned: async (organizationId, id) =>
      readFixtures.resolveRead("tenants.detail", [organizationId, id]),
    findActiveOwnedForUpdate: async (organizationId, id) =>
      readFixtures.resolveRead("tenants.findForUpdate", [organizationId, id]),
    findDocumentConflict: async (organizationId, hash, excludeId) =>
      readFixtures.resolveRead("tenants.documentConflict", [organizationId, hash, excludeId]),
    create: async (input) => {
      consumeRepositoryFailure(state, "tenants.create");
      const now = new Date(FIXED_RENTAL_NOW);
      const id = nextUuid("aaaaaaaa-aaaa-4aaa-8aaa", state.nextTenantId++);
      const tenant = {
        ...createTenantRecord({ ...input, id, createdAt: now }),
        ...input,
        id,
        isActive: input.isActive ?? true,
        deletedAt: null,
        deletedByUserId: null,
        createdAt: now,
        updatedAt: now,
        sensitiveIdentityCiphertext: input.sensitiveIdentityCiphertext
          ? Buffer.from(input.sensitiveIdentityCiphertext)
          : null,
      };
      state.tenants.set(tenant.id, tenant);
      return tenant;
    },
    update: async (input) => {
      consumeRepositoryFailure(state, "tenants.update");
      const effect = mutationFixtures.resolveMutation("tenants.update", input);
      const next = effect.tenant?.row;
      if (!next) throw new Error("Rental tenant update fixture lacks row");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "tenants.update", "after");
      return next;
    },
    setStatus: async (input) => {
      consumeRepositoryFailure(state, "tenants.status");
      const effect = mutationFixtures.resolveMutation("tenants.status", input);
      const next = effect.tenant?.row;
      if (!next) throw new Error("Rental tenant status fixture lacks row");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "tenants.status", "after");
      return next;
    },
    hasContractReference: async (organizationId, tenantId) =>
      readFixtures.resolveRead("tenants.reference", [organizationId, tenantId]),
    softDelete: async (input) => {
      consumeRepositoryFailure(state, "tenants.delete");
      const effect = mutationFixtures.resolveMutation("tenants.delete", input);
      if (!effect.tenant) throw new Error("Rental tenant delete fixture lacks row");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "tenants.delete", "after");
    },
  };
}

function createContractsRepository(
  state: RentalTestState,
  readFixtures: RentalQueryFixtureRegistry,
  mutationFixtures: RentalMutationFixtureRegistry,
): Partial<ContractsRepository> {
  return {
    list: async (organizationId, today, input) =>
      readFixtures.resolveRead("contracts.list", [organizationId, today, input]),
    detail: async (organizationId, id, today) =>
      readFixtures.resolveRead("contracts.detail", [organizationId, id, today]),
    find: async (organizationId, id) =>
      readFixtures.resolveRead("contracts.find", [organizationId, id]),
    findForUpdate: async (organizationId, id) =>
      readFixtures.resolveRead("contracts.findForUpdate", [organizationId, id]),
    findContractReferenceSummary: async (input) =>
      readFixtures.resolveRead("contracts.referenceSummary", [input]),
    countPropertyContracts: async (organizationId, propertyId, today) =>
      readFixtures.resolveRead("contracts.propertyCounts", [organizationId, propertyId, today]),
    nextContractNumber: async (organizationId, year) => {
      consumeRepositoryFailure(state, "contracts.nextContractNumber");
      const args = [organizationId, year] as const;
      if (readFixtures.hasRead("contracts.nextContractNumber", args)) {
        const fixture = readFixtures.resolveRead<RentalContractNumberFixture>(
          "contracts.nextContractNumber",
          args,
        );
        state.contractCounters.set(`${organizationId}/${year}`, fixture.counter);
        consumeRepositoryFailure(state, "contracts.nextContractNumber", "after");
        return fixture.contractNumber;
      }
      const key = `${organizationId}/${year}`;
      const next = (state.contractCounters.get(key) ?? 0) + 1;
      state.contractCounters.set(key, next);
      consumeRepositoryFailure(state, "contracts.nextContractNumber", "after");
      return `RC-${String(year).padStart(4, "0")}-${String(next).padStart(6, "0")}`;
    },
    createDraft: async (input) => {
      consumeRepositoryFailure(state, "contracts.createDraft");
      if (mutationFixtures.hasMutation("contracts.createDraft", input)) {
        const effect = mutationFixtures.resolveMutation("contracts.createDraft", input);
        const next = effect.contract?.row;
        if (!next) throw new Error("Rental contract draft fixture lacks final row");
        applyRentalMutationEffect(state, effect);
        consumeRepositoryFailure(state, "contracts.createDraft", "after");
        return next;
      }
      const now = new Date(FIXED_RENTAL_NOW);
      const contract = createContractRecord({
        ...input,
        id: nextUuid("bbbbbbbb-bbbb-4bbb-8bbb", state.nextContractId++),
        createdAt: now,
        status: "draft",
      });
      state.contracts.set(contract.id, contract);
      return contract;
    },
    updateHeader: async (input) => {
      consumeRepositoryFailure(state, "contracts.updateHeader");
      const effect = mutationFixtures.resolveMutation("contracts.updateHeader", input);
      const next = effect.contract?.row;
      if (!next) throw new Error("Rental contract update fixture lacks row");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "contracts.updateHeader", "after");
      return next;
    },
    setLifecycle: async (input) => {
      consumeRepositoryFailure(state, "contracts.setLifecycle");
      const effect = mutationFixtures.resolveMutation("contracts.setLifecycle", input);
      const next = effect.contract?.row;
      if (!next) throw new Error("Rental contract lifecycle fixture lacks row");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "contracts.setLifecycle", "after");
      return next;
    },
    softDelete: async (input) => {
      const current = findActiveContract(state, input.organizationId, input.id);
      if (current?.status !== "draft") return;
      state.contracts.set(current.id, {
        ...current,
        deletedAt: new Date(FIXED_RENTAL_NOW),
        deletedByUserId: input.deletedByUserId,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(FIXED_RENTAL_NOW),
      });
    },
  };
}

function createContractRelationsRepository(
  state: RentalTestState,
  mutationFixtures: RentalMutationFixtureRegistry,
): Partial<ContractRelationsRepository> {
  return {
    findPartySensitiveSnapshot: async (input) => {
      const contract = state.contracts.get(input.contractId);
      const tenant = state.tenants.get(input.tenantId);
      if (
        !contract ||
        contract.deletedAt !== null ||
        contract.organizationId !== input.organizationId ||
        !tenant ||
        tenant.deletedAt !== null ||
        tenant.organizationId !== input.organizationId
      ) {
        return null;
      }
      const period = state.partyPeriods
        .get(input.contractId)
        ?.find(
          (candidate) =>
            candidate.tenantId === input.tenantId && candidate.validFrom === input.validFrom,
        );
      if (!period) return null;
      return {
        contractId: input.contractId,
        tenantId: input.tenantId,
        validFrom: period.validFrom,
        validTo: period.validTo,
        identitySnapshotCiphertext: period.identitySnapshotCiphertext
          ? Buffer.from(period.identitySnapshotCiphertext)
          : null,
        identitySnapshotKeyVersion: period.identitySnapshotKeyVersion,
      };
    },
    replaceDraftSpaces: async (input) => {
      consumeRepositoryFailure(state, "relations.replaceDraftSpaces");
      const effect = mutationFixtures.resolveMutation("relations.replaceDraftSpaces", input);
      if (!effect.contractSpaces)
        throw new Error("Rental draft spaces fixture lacks contract-space rows");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "relations.replaceDraftSpaces", "after");
    },
    replaceDraftParties: async (input) => {
      const effect = mutationFixtures.resolveMutation("relations.replaceDraftParties", input);
      if (!effect.partyPeriods) throw new Error("Rental draft parties fixture lacks rows");
      applyRentalMutationEffect(state, effect);
    },
    replaceDraftDeposits: async (input) => {
      consumeRepositoryFailure(state, "relations.replaceDraftDeposits");
      const effect = mutationFixtures.resolveMutation("relations.replaceDraftDeposits", input);
      if (!effect.deposits) throw new Error("Rental draft deposits fixture lacks rows");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "relations.replaceDraftDeposits", "after");
    },
    confirmSnapshots: async (input) => {
      consumeRepositoryFailure(state, "relations.confirmSnapshots");
      applyRentalMutationEffect(
        state,
        mutationFixtures.resolveMutation("relations.confirmSnapshots", input),
      );
      consumeRepositoryFailure(state, "relations.confirmSnapshots", "after");
    },
    replacePartyPeriods: async (input) => {
      consumeRepositoryFailure(state, "relations.replacePartyPeriods");
      const effect = mutationFixtures.resolveMutation("relations.replacePartyPeriods", input);
      if (!effect.partyPeriods) throw new Error("Rental party periods fixture lacks final rows");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "relations.replacePartyPeriods", "after");
    },
    clipPartyPeriodsToActualEnd: async (input) => {
      consumeRepositoryFailure(state, "relations.clipPartyPeriodsToActualEnd");
      applyRentalMutationEffect(
        state,
        mutationFixtures.resolveMutation("relations.clipPartyPeriodsToActualEnd", input),
      );
      consumeRepositoryFailure(state, "relations.clipPartyPeriodsToActualEnd", "after");
    },
    restoreTerminalPartyPeriods: async (input) => {
      consumeRepositoryFailure(state, "relations.restoreTerminalPartyPeriods");
      applyRentalMutationEffect(
        state,
        mutationFixtures.resolveMutation("relations.restoreTerminalPartyPeriods", input),
      );
      consumeRepositoryFailure(state, "relations.restoreTerminalPartyPeriods", "after");
    },
    copyTerminalPartySetToDraft: async (input) => {
      consumeRepositoryFailure(state, "relations.copyTerminalPartySetToDraft");
      applyRentalMutationEffect(
        state,
        mutationFixtures.resolveMutation("relations.copyTerminalPartySetToDraft", input),
      );
      consumeRepositoryFailure(state, "relations.copyTerminalPartySetToDraft", "after");
    },
    appendChange: async (input) => {
      consumeRepositoryFailure(state, "relations.appendChange");
      const effect = mutationFixtures.resolveMutation("relations.appendChange", input);
      if (!effect.changes) throw new Error("Rental change fixture lacks final rows");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "relations.appendChange", "after");
    },
    appendTerminationRevocation: async (input) => {
      consumeRepositoryFailure(state, "relations.appendTerminationRevocation");
      const effect = mutationFixtures.resolveMutation(
        "relations.appendTerminationRevocation",
        input,
      );
      if (!effect.actions)
        throw new Error("Rental termination revocation fixture lacks final rows");
      applyRentalMutationEffect(state, effect);
      consumeRepositoryFailure(state, "relations.appendTerminationRevocation", "after");
    },
  };
}

function findActiveContract(state: RentalTestState, organizationId: string, id: string) {
  const contract = state.contracts.get(id);
  return contract?.organizationId === organizationId && contract.deletedAt === null
    ? contract
    : null;
}

function createPropertiesRepository(
  state: RentalTestState,
  readFixtures: RentalQueryFixtureRegistry,
): Partial<PropertiesRepository> {
  return {
    list: async (organizationId, input) =>
      readFixtures.resolveRead("properties.list", [organizationId, input]),
    findActiveOwned: async (organizationId, id) =>
      readFixtures.resolveRead("properties.detail", [organizationId, id]),
    findActiveOwnedForUpdate: async (organizationId, id) =>
      readFixtures.resolveRead("properties.findForUpdate", [organizationId, id]),
    findActiveNameConflict: async (input) =>
      [...state.properties.values()].find(
        (property) =>
          property.organizationId === input.organizationId &&
          property.name === input.name &&
          property.isActive &&
          property.deletedAt === null &&
          property.id !== input.excludeId,
      )
        ? { id: "conflict" }
        : null,
    create: async (input: CreateRentalPropertyInput) => {
      const property = createPropertyRecord({
        ...input,
        id: nextUuid("88888888-8888-4888-8888", state.nextPropertyId++),
        createdAt: new Date(),
      });
      state.properties.set(property.id, property);
      return property;
    },
    update: async (input) => {
      const current = findActiveProperty(state, input.organizationId, input.id);
      if (!current) throw new Error("Failed to update active rental property");
      const next = { ...current, ...input, updatedAt: new Date() };
      state.properties.set(next.id, next);
      return next;
    },
    setStatus: async (input) => {
      const current = findActiveProperty(state, input.organizationId, input.id);
      if (!current) throw new Error("Failed to set rental property status");
      const next = { ...current, isActive: input.isActive, updatedAt: new Date() };
      state.properties.set(next.id, next);
      return next;
    },
    hasActiveSpace: async (organizationId, propertyId) =>
      [...state.spaces.values()].some(
        (space) =>
          space.organizationId === organizationId &&
          space.propertyId === propertyId &&
          space.deletedAt === null,
      ),
    softDelete: async (input) => {
      const current = findActiveProperty(state, input.organizationId, input.id);
      if (!current) return;
      state.properties.set(current.id, {
        ...current,
        deletedAt: new Date(),
        deletedByUserId: input.deletedByUserId,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      });
    },
  };
}

function createSpacesRepository(
  state: RentalTestState,
  readFixtures: RentalQueryFixtureRegistry,
): Partial<SpacesRepository> {
  return {
    listChildren: async (organizationId, propertyId, input) =>
      readFixtures.resolveRead("spaces.listChildren", [organizationId, propertyId, input]),
    search: async (organizationId, propertyId, input) =>
      readFixtures.resolveRead("spaces.search", [organizationId, propertyId, input]),
    findActiveOwned: async (organizationId, propertyId, id) =>
      findActiveSpace(state, organizationId, propertyId, id),
    findActiveOwnedById: async (organizationId, id) => {
      const space = state.spaces.get(id);
      return space?.organizationId === organizationId && space.deletedAt === null ? space : null;
    },
    findActiveOwnedForUpdate: async (organizationId, propertyId, id) =>
      readFixtures.resolveRead("spaces.findForUpdate", [organizationId, propertyId, id]),
    listAncestors: async (organizationId, propertyId, id) =>
      readFixtures.resolveRead("spaces.ancestors", [organizationId, propertyId, id]),
    listDescendantIds: async (organizationId, propertyId, id) =>
      readFixtures.resolveRead("spaces.descendants", [organizationId, propertyId, id]),
    listLeaseStates: async (organizationId, propertyId, spaceIds, today) =>
      readFixtures.resolveRead("spaces.leaseStates", [organizationId, propertyId, spaceIds, today]),
    getSubtreeRelativeDepth: async (organizationId, propertyId, id) =>
      subtreeDepth(state, organizationId, propertyId, id),
    hasActiveChildren: async (organizationId, propertyId, id) =>
      [...state.spaces.values()].some(
        (space) =>
          space.organizationId === organizationId &&
          space.propertyId === propertyId &&
          space.parentId === id &&
          space.deletedAt === null,
      ),
    hasAnyChildren: async (organizationId, propertyId, id) =>
      [...state.spaces.values()].some(
        (space) =>
          space.organizationId === organizationId &&
          space.propertyId === propertyId &&
          space.parentId === id,
      ),
    findSiblingConflicts: async (input) =>
      [...state.spaces.values()]
        .filter(
          (space) =>
            space.organizationId === input.organizationId &&
            space.propertyId === input.propertyId &&
            space.parentId === input.parentId &&
            space.deletedAt === null &&
            space.id !== input.excludeId &&
            (input.names.includes(space.name) ||
              (space.code !== null && input.codes.includes(space.code))),
        )
        .map((space) => ({ id: space.id, name: space.name, code: space.code })),
    create: async (input: CreateRentalSpaceInput) => {
      const space = createSpaceRecord({
        ...input,
        id: nextUuid("99999999-9999-4999-8999", state.nextSpaceId++),
        createdAt: new Date(),
      });
      state.spaces.set(space.id, space);
      return space;
    },
    createMany: async (inputs) => {
      const spaces = inputs.map((input) =>
        createSpaceRecord({
          ...input,
          id: nextUuid("99999999-9999-4999-8999", state.nextSpaceId++),
          createdAt: new Date(),
        }),
      );
      for (const space of spaces) state.spaces.set(space.id, space);
      return spaces;
    },
    update: async (input) => updateSpace(state, input),
    move: async (input) => updateSpace(state, input),
    setStatus: async (input) => updateSpace(state, input),
    softDelete: async (input) => {
      const current = findActiveSpace(state, input.organizationId, input.propertyId, input.id);
      if (!current) return;
      state.spaces.set(current.id, {
        ...current,
        deletedAt: new Date(),
        deletedByUserId: input.deletedByUserId,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      });
    },
  };
}

function createRentalLedgersRepository(state: RentalTestState, bookkeeping: BookkeepingTestState) {
  return {
    createRental: async (input: {
      organizationId: string;
      name: string;
      createdByUserId: string;
    }) => {
      const now = new Date();
      const id = nextUuid("44444444-4444-4444-8444", state.nextLedgerId++ + 100);
      const ledger = {
        id,
        organizationId: input.organizationId,
        name: input.name,
        type: "rental" as const,
        isDefault: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      bookkeeping.ledgers.set(id, ledger);
      return {
        id,
        name: ledger.name,
        type: ledger.type,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };
    },
    renameActiveRental: async (input: { organizationId: string; id: string; name: string }) => {
      const ledger = bookkeeping.ledgers.get(input.id);
      if (
        !ledger ||
        ledger.organizationId !== input.organizationId ||
        ledger.type !== "rental" ||
        ledger.deletedAt
      ) {
        return false;
      }
      bookkeeping.ledgers.set(input.id, { ...ledger, name: input.name, updatedAt: new Date() });
      return true;
    },
    findActiveRental: async (organizationId: string, id: string) => {
      const ledger = bookkeeping.ledgers.get(id);
      return ledger?.organizationId === organizationId &&
        ledger.type === "rental" &&
        ledger.deletedAt === null
        ? { id }
        : null;
    },
    hasAnyTransactionReference: async (organizationId: string, ledgerId: string) =>
      [...bookkeeping.transactions.values()].some(
        (transaction) =>
          transaction.organizationId === organizationId && transaction.ledgerId === ledgerId,
      ),
    softDeleteActiveRental: async (input: {
      organizationId: string;
      id: string;
      deletedByUserId: string;
    }) => {
      const ledger = bookkeeping.ledgers.get(input.id);
      if (
        !ledger ||
        ledger.organizationId !== input.organizationId ||
        ledger.type !== "rental" ||
        ledger.deletedAt
      ) {
        return false;
      }
      bookkeeping.ledgers.set(input.id, {
        ...ledger,
        deletedAt: new Date(),
        updatedAt: new Date(),
      });
      return true;
    },
  };
}

function findActiveProperty(state: RentalTestState, organizationId: string, id: string) {
  const property = state.properties.get(id);
  return property?.organizationId === organizationId && property.deletedAt === null
    ? property
    : null;
}

function findActiveSpace(
  state: RentalTestState,
  organizationId: string,
  propertyId: string,
  id: string,
) {
  const space = state.spaces.get(id);
  return space?.organizationId === organizationId &&
    space.propertyId === propertyId &&
    space.deletedAt === null
    ? space
    : null;
}

function subtreeDepth(
  state: RentalTestState,
  organizationId: string,
  propertyId: string,
  id: string,
): number {
  const children = [...state.spaces.values()].filter(
    (space) =>
      space.organizationId === organizationId &&
      space.propertyId === propertyId &&
      space.parentId === id &&
      space.deletedAt === null,
  );
  return children.length === 0
    ? 0
    : 1 +
        Math.max(
          ...children.map((child) => subtreeDepth(state, organizationId, propertyId, child.id)),
        );
}

function updateSpace(
  state: RentalTestState,
  input: { id: string; organizationId: string; propertyId: string },
) {
  const current = findActiveSpace(state, input.organizationId, input.propertyId, input.id);
  if (!current) throw new Error("Failed to update active rental space");
  const next = { ...current, ...input, updatedAt: new Date() };
  state.spaces.set(next.id, next);
  return next;
}
