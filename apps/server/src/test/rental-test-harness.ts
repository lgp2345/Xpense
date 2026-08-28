import type { AppDbTransaction } from "../db/db.module.js";
import { LedgersRepository } from "../modules/bookkeeping/ledgers.repository.js";
import { PropertiesRepository } from "../modules/rental/properties.repository.js";
import type {
  CreateRentalPropertyInput,
  RentalPropertyDetailRecord,
  RentalPropertyRecord,
} from "../modules/rental/properties.repository.types.js";
import { SpacesRepository } from "../modules/rental/spaces.repository.js";
import type {
  CreateRentalSpaceInput,
  RentalSpaceRecord,
} from "../modules/rental/spaces.repository.types.js";
import { testIds } from "./auth-test-helpers.js";
import type { BookkeepingTestState } from "./bookkeeping-test-state.js";

export const rentalTestIds = {
  foreignProperty: "88888888-8888-4888-8888-888888888801",
  foreignLedger: "44444444-4444-4444-8444-444444444499",
  foreignSpace: "99999999-9999-4999-8999-999999999901",
} as const;

/** 租赁 HTTP 测试所需的内存持久化状态，含一组固定跨组织资源。 */
export type RentalTestState = {
  properties: Map<string, RentalPropertyRecord>;
  spaces: Map<string, RentalSpaceRecord>;
  nextPropertyId: number;
  nextSpaceId: number;
  nextLedgerId: number;
};

/** 构造仅供 E2E 使用的租赁状态，不触发任何外部服务。 */
export function createRentalTestState(): RentalTestState {
  const createdAt = new Date("2026-08-01T00:00:00.000Z");
  return {
    properties: new Map([
      [
        rentalTestIds.foreignProperty,
        createPropertyRecord({
          id: rentalTestIds.foreignProperty,
          organizationId: testIds.otherOrganization,
          ledgerId: rentalTestIds.foreignLedger,
          name: "其他组织房产",
          createdByUserId: testIds.outsiderUser,
          createdAt,
        }),
      ],
    ]),
    spaces: new Map([
      [
        rentalTestIds.foreignSpace,
        createSpaceRecord({
          id: rentalTestIds.foreignSpace,
          organizationId: testIds.otherOrganization,
          propertyId: rentalTestIds.foreignProperty,
          name: "其他组织空间",
          createdByUserId: testIds.outsiderUser,
          createdAt,
        }),
      ],
    ]),
    nextPropertyId: 1,
    nextSpaceId: 1,
    nextLedgerId: 1,
  };
}

/** 深复制租赁状态，供事务失败时恢复。 */
export function cloneRentalTestState(state: RentalTestState): RentalTestState {
  return {
    properties: new Map([...state.properties].map(([id, property]) => [id, { ...property }])),
    spaces: new Map([...state.spaces].map(([id, space]) => [id, { ...space }])),
    nextPropertyId: state.nextPropertyId,
    nextSpaceId: state.nextSpaceId,
    nextLedgerId: state.nextLedgerId,
  };
}

/** 原位恢复租赁状态，保持所有仓储捕获的 state 引用有效。 */
export function restoreRentalTestState(state: RentalTestState, snapshot: RentalTestState): void {
  replaceMap(state.properties, snapshot.properties);
  replaceMap(state.spaces, snapshot.spaces);
  state.nextPropertyId = snapshot.nextPropertyId;
  state.nextSpaceId = snapshot.nextSpaceId;
  state.nextLedgerId = snapshot.nextLedgerId;
}

/** 创建租赁仓储和租赁账本边界的内存实现。 */
export function createRentalRepositoryFakes(
  state: RentalTestState,
  bookkeeping: BookkeepingTestState,
) {
  return {
    propertiesRepository: createPropertiesRepository(state),
    spacesRepository: createSpacesRepository(state),
    extendLedgersRepository: (repository: Partial<LedgersRepository>) =>
      Object.assign(repository, createRentalLedgersRepository(state, bookkeeping)),
  };
}

/** 同时快照租赁、记账与审计状态，保证跨模块写入的原子性。 */
export function createRentalTransactionService(
  rental: RentalTestState,
  bookkeeping: BookkeepingTestState,
  auditLogs: unknown[],
  cloneBookkeeping: (state: BookkeepingTestState) => BookkeepingTestState,
  restoreBookkeeping: (state: BookkeepingTestState, snapshot: BookkeepingTestState) => void,
): { run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> } {
  return {
    async run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> {
      const rentalSnapshot = cloneRentalTestState(rental);
      const bookkeepingSnapshot = cloneBookkeeping(bookkeeping);
      const auditLength = auditLogs.length;
      try {
        return await operation({} as AppDbTransaction);
      } catch (error) {
        restoreRentalTestState(rental, rentalSnapshot);
        restoreBookkeeping(bookkeeping, bookkeepingSnapshot);
        auditLogs.splice(auditLength);
        throw error;
      }
    },
  };
}

function createPropertiesRepository(state: RentalTestState): Partial<PropertiesRepository> {
  return {
    list: async (organizationId, input) => {
      const keyword = input.keyword?.toLocaleLowerCase();
      const items = [...state.properties.values()]
        .filter(
          (property) => property.organizationId === organizationId && property.deletedAt === null,
        )
        .filter((property) => input.type === undefined || property.type === input.type)
        .filter((property) => input.isActive === undefined || property.isActive === input.isActive)
        .filter((property) => input.province === undefined || property.province === input.province)
        .filter((property) => input.city === undefined || property.city === input.city)
        .filter((property) => input.district === undefined || property.district === input.district)
        .filter((property) => {
          if (!keyword) return true;
          return [
            property.name,
            property.countryCode,
            property.province,
            property.city,
            property.district,
            property.addressLine,
          ].some((value) => value?.toLocaleLowerCase().includes(keyword));
        })
        .toSorted((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
        .map((property) => toPropertyDetail(state, property));
      const offset = (input.page - 1) * input.pageSize;
      return { items: items.slice(offset, offset + input.pageSize), total: items.length, ...input };
    },
    findActiveOwned: async (organizationId, id) => {
      const property = findActiveProperty(state, organizationId, id);
      return property ? toPropertyDetail(state, property) : null;
    },
    findActiveOwnedForUpdate: async (organizationId, id) =>
      findActiveProperty(state, organizationId, id),
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
        updatedAt: new Date(),
      });
    },
  };
}

function createSpacesRepository(state: RentalTestState): Partial<SpacesRepository> {
  return {
    listChildren: async (organizationId, propertyId, input) => {
      const items = [...state.spaces.values()]
        .filter(
          (space) =>
            space.organizationId === organizationId &&
            space.propertyId === propertyId &&
            space.parentId === input.parentId &&
            space.deletedAt === null,
        )
        .toSorted(
          (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
        )
        .map((space) => toSpaceNode(state, space));
      const offset = (input.page - 1) * input.pageSize;
      return { items: items.slice(offset, offset + input.pageSize), total: items.length, ...input };
    },
    search: async (organizationId, propertyId, input) => {
      const keyword = input.keyword.toLocaleLowerCase();
      const items = [...state.spaces.values()]
        .filter(
          (space) =>
            space.organizationId === organizationId &&
            space.propertyId === propertyId &&
            space.deletedAt === null &&
            (space.name.toLocaleLowerCase().includes(keyword) ||
              space.code?.toLocaleLowerCase().includes(keyword)),
        )
        .toSorted(
          (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
        )
        .map((space) => ({ ...toSpaceNode(state, space), path: listAncestors(state, space) }));
      const offset = (input.page - 1) * input.pageSize;
      return { items: items.slice(offset, offset + input.pageSize), total: items.length, ...input };
    },
    findActiveOwned: async (organizationId, propertyId, id) =>
      findActiveSpace(state, organizationId, propertyId, id),
    findActiveOwnedById: async (organizationId, id) => {
      const space = state.spaces.get(id);
      return space?.organizationId === organizationId && space.deletedAt === null ? space : null;
    },
    findActiveOwnedForUpdate: async (organizationId, propertyId, id) =>
      findActiveSpace(state, organizationId, propertyId, id),
    listAncestors: async (organizationId, propertyId, id) => {
      const space = findActiveSpace(state, organizationId, propertyId, id);
      return space ? listAncestors(state, space) : [];
    },
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
            space.isActive &&
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

function toPropertyDetail(
  state: RentalTestState,
  property: RentalPropertyRecord,
): RentalPropertyDetailRecord {
  const spaces = [...state.spaces.values()].filter(
    (space) => space.propertyId === property.id && space.deletedAt === null,
  );
  return {
    ...property,
    spaceCount: spaces.length,
    rentableSpaceCount: spaces.filter((space) => space.isRentable).length,
  };
}

function toSpaceNode(state: RentalTestState, space: RentalSpaceRecord) {
  const property = state.properties.get(space.propertyId);
  const ancestors = listAncestors(state, space).slice(0, -1);
  return {
    id: space.id,
    propertyId: space.propertyId,
    parentId: space.parentId,
    name: space.name,
    code: space.code,
    type: space.type,
    customTypeName: space.customTypeName,
    isRentable: space.isRentable,
    isActive: space.isActive,
    isEffectivelyActive:
      Boolean(property?.isActive) &&
      space.isActive &&
      ancestors.every((ancestor) => state.spaces.get(ancestor.id)?.isActive),
    sortOrder: space.sortOrder,
    hasChildren: [...state.spaces.values()].some(
      (candidate) => candidate.parentId === space.id && candidate.deletedAt === null,
    ),
  };
}

function listAncestors(state: RentalTestState, space: RentalSpaceRecord) {
  const path: Array<{ id: string; name: string }> = [];
  let current: RentalSpaceRecord | undefined = space;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId === null ? undefined : state.spaces.get(current.parentId);
  }
  return path;
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

function createPropertyRecord(input: {
  id: string;
  organizationId: string;
  ledgerId: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  type?: RentalPropertyRecord["type"];
  countryCode?: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  addressLine?: string;
  note?: string | null;
}): RentalPropertyRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    ledgerId: input.ledgerId,
    name: input.name,
    type: input.type ?? "apartment_building",
    customTypeName: null,
    countryCode: input.countryCode ?? "CN",
    province: input.province ?? null,
    city: input.city ?? null,
    district: input.district ?? null,
    addressLine: input.addressLine ?? "测试地址",
    note: input.note ?? null,
    isActive: true,
    createdByUserId: input.createdByUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function createSpaceRecord(input: {
  id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  parentId?: string | null;
  code?: string | null;
  type?: RentalSpaceRecord["type"];
  customTypeName?: string | null;
  isRentable?: boolean;
  sortOrder?: number;
}): RentalSpaceRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    parentId: input.parentId ?? null,
    name: input.name,
    code: input.code ?? null,
    type: input.type ?? "room",
    customTypeName: input.customTypeName ?? null,
    isRentable: input.isRentable ?? false,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
    createdByUserId: input.createdByUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function nextUuid(prefix: string, counter: number): string {
  return `${prefix}-${String(counter).padStart(12, "0")}`;
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}
