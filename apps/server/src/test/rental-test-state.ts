import type {
  ContractPartyReference,
  RentalContractDepositRecord,
  RentalContractPartyPeriodRecord,
  RentalContractRecord,
  RentalContractSpaceRecord,
} from "../modules/rental/contracts.repository.types.js";
import type { RentalPropertyRecord } from "../modules/rental/properties.repository.types.js";
import type { RentalSpaceRecord } from "../modules/rental/spaces.repository.types.js";
import type { RentalTenantRecord } from "../modules/rental/tenants.repository.types.js";
import { testIds } from "./auth-test-helpers.js";

export const rentalTestIds = {
  foreignProperty: "88888888-8888-4888-8888-888888888801",
  foreignLedger: "44444444-4444-4444-8444-444444444499",
  foreignSpace: "99999999-9999-4999-8999-999999999901",
  property: "77777777-7777-4777-8777-777777777701",
  parentSpace: "99999999-9999-4999-8999-999999999902",
  childSpace: "99999999-9999-4999-8999-999999999903",
  tenant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
  foreignTenant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
  contract: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01",
  foreignContract: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
} as const;

export const FIXED_RENTAL_NOW = new Date("2026-08-31T04:00:00.000Z");
export const TEST_DOCUMENT_CIPHERTEXT = Buffer.from("fixed-rental-test-ciphertext");

/** 租赁 HTTP 测试所需的内存持久化状态，含一组固定跨组织资源。 */
export type RentalTestState = {
  properties: Map<string, RentalPropertyRecord>;
  spaces: Map<string, RentalSpaceRecord>;
  tenants: Map<string, RentalTenantRecord>;
  contracts: Map<string, RentalContractRecord>;
  contractSpaces: Map<string, RentalContractSpaceRecord[]>;
  partyPeriods: Map<string, RentalPartyPeriodRecord[]>;
  changes: Map<string, RentalContractChangeRecord[]>;
  actions: Map<string, RentalContractActionRecord[]>;
  deposits: Map<string, RentalContractDepositRecord[]>;
  snapshots: Map<string, RentalContractSnapshotRecord>;
  auditEntries: RentalAuditEntry[];
  contractCounters: Map<string, number>;
  nextPropertyId: number;
  nextSpaceId: number;
  nextLedgerId: number;
  nextTenantId: number;
  nextContractId: number;
  nextContractSpaceId: number;
  nextPartyPeriodId: number;
  nextChangeId: number;
  nextDepositId: number;
  nextSnapshotId: number;
  nextActionId: number;
  /** 测试专用：对明确的 repository seam 注入一次故障。 */
  failNextRepositoryOperation: string | null;
  /** 测试专用：故障发生在 repository effect 应用前或后。 */
  failNextRepositoryOperationPhase: "before" | "after" | null;
};

export type RentalContractChangeRecord = {
  id: string;
  organizationId: string;
  contractId: string;
  type: "parties_changed";
  effectiveDate: string;
  reason: string;
  beforePartyRefs: ContractPartyReference[];
  afterPartyRefs: ContractPartyReference[];
  createdByUserId: string;
};

export type RentalContractActionRecord = {
  id: string;
  organizationId: string;
  contractId: string;
  type: "termination_revoked";
  reason: string;
  terminationDateBeforeRevoke: string;
  createdByUserId: string;
};

export type RentalContractSnapshotRecord = {
  contractId: string;
  spaces: RentalContractSpaceRecord[];
  parties: RentalPartyPeriodRecord[];
  deposits: RentalContractDepositRecord[];
};

export type RentalPartyPeriodRecord = RentalContractPartyPeriodRecord & {
  identitySnapshotCiphertext: Buffer | null;
  identitySnapshotKeyVersion: number | null;
};

export type RentalAuditEntry = {
  action: string;
  targetId: string;
  metadata: Record<string, unknown>;
};

/** 构造仅供 E2E 使用的租赁状态，不触发任何外部服务。 */
export function createRentalTestState(): RentalTestState {
  const createdAt = new Date("2026-08-01T00:00:00.000Z");
  const tenant = createTenantRecord({
    id: rentalTestIds.tenant,
    organizationId: testIds.organization,
    name: "测试租户",
    createdByUserId: testIds.ownerUser,
    createdAt,
  });
  const property = createPropertyRecord({
    id: rentalTestIds.property,
    organizationId: testIds.organization,
    ledgerId: "44444444-4444-4444-8444-444444444401",
    name: "测试房产",
    createdByUserId: testIds.ownerUser,
    createdAt,
  });
  const parentSpace = createSpaceRecord({
    id: rentalTestIds.parentSpace,
    organizationId: testIds.organization,
    propertyId: property.id,
    name: "测试楼栋",
    createdByUserId: testIds.ownerUser,
    createdAt,
    type: "building",
    isRentable: true,
  });
  const childSpace = createSpaceRecord({
    id: rentalTestIds.childSpace,
    organizationId: testIds.organization,
    propertyId: property.id,
    parentId: parentSpace.id,
    name: "测试房间",
    createdByUserId: testIds.ownerUser,
    createdAt,
    isRentable: true,
  });
  const foreignTenant = createTenantRecord({
    id: rentalTestIds.foreignTenant,
    organizationId: testIds.otherOrganization,
    name: "其他组织租户",
    createdByUserId: testIds.outsiderUser,
    createdAt,
  });
  const contract = createContractRecord({
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    createdByUserId: testIds.ownerUser,
    createdAt,
    status: "confirmed",
    startDate: "2026-08-01",
    endDate: "2026-12-31",
  });
  const foreignContract = createContractRecord({
    id: rentalTestIds.foreignContract,
    organizationId: testIds.otherOrganization,
    propertyId: rentalTestIds.foreignProperty,
    contractNumber: "RC-2026-000001",
    createdByUserId: testIds.outsiderUser,
    createdAt,
    status: "confirmed",
    startDate: "2026-08-01",
    endDate: "2026-12-31",
  });
  const initialContractSpace: RentalContractSpaceRecord = {
    spaceId: childSpace.id,
    spaceName: childSpace.name,
    spaceCode: childSpace.code,
    spacePath: [
      { id: parentSpace.id, name: parentSpace.name },
      { id: childSpace.id, name: childSpace.name },
    ],
    rentAllocationMinor: null,
  };
  const initialParty = partyPeriodFromTenant(
    { tenants: new Map([[tenant.id, tenant]]) } as RentalTestState,
    contract.id,
    { tenantId: tenant.id, isPrimaryPayer: true },
    contract.startDate,
    contract.endDate,
  );
  return {
    properties: new Map([
      [property.id, property],
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
      [parentSpace.id, parentSpace],
      [childSpace.id, childSpace],
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
    tenants: new Map([
      [tenant.id, tenant],
      [foreignTenant.id, foreignTenant],
    ]),
    contracts: new Map([
      [contract.id, contract],
      [foreignContract.id, foreignContract],
    ]),
    contractSpaces: new Map([[contract.id, [initialContractSpace]]]),
    partyPeriods: new Map([[contract.id, [initialParty]]]),
    changes: new Map(),
    actions: new Map(),
    deposits: new Map(),
    snapshots: new Map(),
    auditEntries: [],
    contractCounters: new Map(),
    nextTenantId: 1,
    nextContractId: 1,
    nextContractSpaceId: 1,
    nextPartyPeriodId: 1,
    nextChangeId: 1,
    nextDepositId: 1,
    nextSnapshotId: 1,
    nextActionId: 1,
    failNextRepositoryOperation: null,
    failNextRepositoryOperationPhase: null,
  };
}

/** 深复制租赁状态，供事务失败时恢复。 */
export function cloneRentalTestState(state: RentalTestState): RentalTestState {
  return {
    properties: new Map(
      [...state.properties].map(([id, property]) => [id, cloneProperty(property)]),
    ),
    spaces: new Map([...state.spaces].map(([id, space]) => [id, cloneSpace(space)])),
    tenants: new Map([...state.tenants].map(([id, tenant]) => [id, cloneTenant(tenant)])),
    contracts: new Map([...state.contracts].map(([id, contract]) => [id, cloneContract(contract)])),
    contractSpaces: cloneArrayMap(state.contractSpaces, cloneContractSpace),
    partyPeriods: cloneArrayMap(state.partyPeriods, clonePartyPeriod),
    changes: cloneArrayMap(state.changes, cloneChange),
    actions: cloneArrayMap(state.actions, cloneAction),
    deposits: cloneArrayMap(state.deposits, cloneDeposit),
    snapshots: new Map([...state.snapshots].map(([id, snapshot]) => [id, cloneSnapshot(snapshot)])),
    auditEntries: state.auditEntries.map(cloneAuditEntry),
    contractCounters: new Map(state.contractCounters),
    nextPropertyId: state.nextPropertyId,
    nextSpaceId: state.nextSpaceId,
    nextLedgerId: state.nextLedgerId,
    nextTenantId: state.nextTenantId,
    nextContractId: state.nextContractId,
    nextContractSpaceId: state.nextContractSpaceId,
    nextPartyPeriodId: state.nextPartyPeriodId,
    nextChangeId: state.nextChangeId,
    nextDepositId: state.nextDepositId,
    nextSnapshotId: state.nextSnapshotId,
    nextActionId: state.nextActionId,
    // 故障注入是测试控制面，不属于可回滚业务状态；失败消费后不可被事务快照重新武装。
    failNextRepositoryOperation: null,
    failNextRepositoryOperationPhase: null,
  };
}

/** 原位恢复租赁状态，保持所有仓储捕获的 state 引用有效。 */
export function restoreRentalTestState(state: RentalTestState, snapshot: RentalTestState): void {
  replaceMap(state.properties, snapshot.properties, cloneProperty);
  replaceMap(state.spaces, snapshot.spaces, cloneSpace);
  replaceMap(state.tenants, snapshot.tenants, cloneTenant);
  replaceMap(state.contracts, snapshot.contracts, cloneContract);
  replaceArrayMap(state.contractSpaces, snapshot.contractSpaces, cloneContractSpace);
  replaceArrayMap(state.partyPeriods, snapshot.partyPeriods, clonePartyPeriod);
  replaceArrayMap(state.changes, snapshot.changes, cloneChange);
  replaceArrayMap(state.actions, snapshot.actions, cloneAction);
  replaceArrayMap(state.deposits, snapshot.deposits, cloneDeposit);
  replaceSnapshotMap(state.snapshots, snapshot.snapshots);
  state.auditEntries.splice(
    0,
    state.auditEntries.length,
    ...snapshot.auditEntries.map(cloneAuditEntry),
  );
  replaceMap(state.contractCounters, snapshot.contractCounters);
  state.nextPropertyId = snapshot.nextPropertyId;
  state.nextSpaceId = snapshot.nextSpaceId;
  state.nextLedgerId = snapshot.nextLedgerId;
  state.nextTenantId = snapshot.nextTenantId;
  state.nextContractId = snapshot.nextContractId;
  state.nextContractSpaceId = snapshot.nextContractSpaceId;
  state.nextPartyPeriodId = snapshot.nextPartyPeriodId;
  state.nextChangeId = snapshot.nextChangeId;
  state.nextDepositId = snapshot.nextDepositId;
  state.nextSnapshotId = snapshot.nextSnapshotId;
  state.nextActionId = snapshot.nextActionId;
}

/** 创建租赁仓储和租赁账本边界的内存实现。 */

export function tenantSnapshot(state: RentalTestState, tenantId: string) {
  const tenant = state.tenants.get(tenantId);
  return tenant
    ? {
        tenantType: tenant.type,
        tenantName: tenant.name,
        phone: tenant.phone,
        email: tenant.email,
        primaryContactName: tenant.primaryContactName,
        primaryContactPhone: tenant.primaryContactPhone,
        documentCountryCode: tenant.documentCountryCode,
        documentType: tenant.documentType,
        documentTypeOtherName: tenant.documentTypeOtherName,
        maskedDocumentNumber: tenant.maskedDocumentNumber,
      }
    : {
        tenantType: "individual" as const,
        tenantName: "",
        phone: null,
        email: null,
        primaryContactName: null,
        primaryContactPhone: null,
        documentCountryCode: null,
        documentType: null,
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
      };
}

export function partyPeriodFromTenant(
  state: RentalTestState,
  _contractId: string,
  party: ContractPartyReference,
  validFrom: string | null,
  validTo: string | null,
): RentalPartyPeriodRecord {
  return {
    tenantId: party.tenantId,
    ...tenantSnapshot(state, party.tenantId),
    validFrom,
    validTo,
    isPrimaryPayer: party.isPrimaryPayer,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  };
}

export function identitySnapshot(state: RentalTestState, tenantId: string) {
  const tenant = state.tenants.get(tenantId);
  return {
    identitySnapshotCiphertext: tenant?.sensitiveIdentityCiphertext
      ? Buffer.from(tenant.sensitiveIdentityCiphertext)
      : null,
    identitySnapshotKeyVersion: tenant?.sensitiveIdentityKeyVersion ?? null,
  };
}

export function calculateRentMultiple(rent: number | null, multiple: string | null): number | null {
  if (rent === null || multiple === null) return null;
  return Math.round(rent * Number(multiple));
}

export function previousCalendarDate(date: string): string {
  return addDays(date, -1);
}
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** 同时快照租赁、记账与审计状态，保证跨模块写入的原子性。 */

export function createPropertyRecord(input: {
  id: string;
  organizationId: string;
  ledgerId: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  type?: RentalPropertyRecord["type"];
  customTypeName?: string | null;
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
    customTypeName: input.customTypeName ?? null,
    countryCode: input.countryCode ?? "CN",
    province: input.province ?? null,
    city: input.city ?? null,
    district: input.district ?? null,
    addressLine: input.addressLine ?? "测试地址",
    note: input.note ?? null,
    isActive: true,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.createdByUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function createTenantRecord(input: {
  id: string;
  organizationId: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  maskedDocumentNumber?: string | null;
}): RentalTenantRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    type: "individual",
    name: input.name,
    phone: "13800000001",
    email: "tenant@example.com",
    primaryContactName: null,
    primaryContactPhone: null,
    documentCountryCode: "CN",
    documentType: "national_id",
    documentTypeOtherName: null,
    maskedDocumentNumber: input.maskedDocumentNumber ?? null,
    documentNumberLookupHash: `test-lookup-${input.id}`,
    sensitiveIdentityCiphertext: Buffer.from(TEST_DOCUMENT_CIPHERTEXT),
    sensitiveIdentityKeyVersion: 1,
    isActive: true,
    note: "测试备注",
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.createdByUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.createdAt),
  };
}

export function createContractRecord(
  input: Pick<
    RentalContractRecord,
    "id" | "organizationId" | "propertyId" | "contractNumber" | "createdByUserId"
  > &
    Partial<RentalContractRecord>,
): RentalContractRecord {
  const createdAt = input.createdAt ?? FIXED_RENTAL_NOW;
  return {
    id: input.id,
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    contractNumber: input.contractNumber,
    externalContractNumber: input.externalContractNumber ?? null,
    status: input.status ?? "draft",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    rentAmountMinor: input.rentAmountMinor ?? 10000,
    billingAnchor: input.billingAnchor ?? "contract_start",
    paymentIntervalMonths: input.paymentIntervalMonths ?? 1,
    dueDaysBefore: input.dueDaysBefore ?? 0,
    renewedFromContractId: input.renewedFromContractId ?? null,
    cancelledAt: input.cancelledAt ?? null,
    cancelledByUserId: input.cancelledByUserId ?? null,
    cancellationReason: input.cancellationReason ?? null,
    terminationDate: input.terminationDate ?? null,
    terminationRecordedAt: input.terminationRecordedAt ?? null,
    terminatedByUserId: input.terminatedByUserId ?? null,
    terminationReason: input.terminationReason ?? null,
    note: input.note ?? null,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.updatedByUserId ?? input.createdByUserId,
    deletedAt: input.deletedAt ?? null,
    deletedByUserId: input.deletedByUserId ?? null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(input.updatedAt ?? createdAt),
  };
}

export function cloneProperty(property: RentalPropertyRecord): RentalPropertyRecord {
  return {
    ...property,
    createdAt: new Date(property.createdAt),
    updatedAt: new Date(property.updatedAt),
    deletedAt: property.deletedAt ? new Date(property.deletedAt) : null,
  };
}
export function cloneSpace(space: RentalSpaceRecord): RentalSpaceRecord {
  return {
    ...space,
    createdAt: new Date(space.createdAt),
    updatedAt: new Date(space.updatedAt),
    deletedAt: space.deletedAt ? new Date(space.deletedAt) : null,
  };
}
export function cloneTenant(tenant: RentalTenantRecord): RentalTenantRecord {
  return {
    ...tenant,
    sensitiveIdentityCiphertext: tenant.sensitiveIdentityCiphertext
      ? Buffer.from(tenant.sensitiveIdentityCiphertext)
      : null,
    createdAt: new Date(tenant.createdAt),
    updatedAt: new Date(tenant.updatedAt),
    deletedAt: tenant.deletedAt ? new Date(tenant.deletedAt) : null,
  };
}
export function cloneContract(contract: RentalContractRecord): RentalContractRecord {
  return {
    ...contract,
    createdAt: new Date(contract.createdAt),
    updatedAt: new Date(contract.updatedAt),
    cancelledAt: contract.cancelledAt ? new Date(contract.cancelledAt) : null,
    terminationRecordedAt: contract.terminationRecordedAt
      ? new Date(contract.terminationRecordedAt)
      : null,
    deletedAt: contract.deletedAt ? new Date(contract.deletedAt) : null,
  };
}
export function cloneContractSpace(space: RentalContractSpaceRecord): RentalContractSpaceRecord {
  return { ...space, spacePath: space.spacePath.map((node) => ({ ...node })) };
}
export function clonePartyPeriod(period: RentalPartyPeriodRecord): RentalPartyPeriodRecord {
  return {
    ...period,
    identitySnapshotCiphertext: period.identitySnapshotCiphertext
      ? Buffer.from(period.identitySnapshotCiphertext)
      : null,
  };
}
export function cloneDeposit(deposit: RentalContractDepositRecord): RentalContractDepositRecord {
  return { ...deposit };
}
export function cloneChange(change: RentalContractChangeRecord): RentalContractChangeRecord {
  return {
    ...change,
    beforePartyRefs: change.beforePartyRefs.map((party) => ({ ...party })),
    afterPartyRefs: change.afterPartyRefs.map((party) => ({ ...party })),
  };
}
export function cloneAction(action: RentalContractActionRecord): RentalContractActionRecord {
  return { ...action };
}
export function cloneSnapshot(
  snapshot: RentalContractSnapshotRecord,
): RentalContractSnapshotRecord {
  return {
    contractId: snapshot.contractId,
    spaces: snapshot.spaces.map(cloneContractSpace),
    parties: snapshot.parties.map(clonePartyPeriod),
    deposits: snapshot.deposits.map(cloneDeposit),
  };
}
export function replaceSnapshotMap(
  target: Map<string, RentalContractSnapshotRecord>,
  source: Map<string, RentalContractSnapshotRecord>,
): void {
  for (const key of target.keys()) if (!source.has(key)) target.delete(key);
  for (const [key, snapshot] of source) {
    const current = target.get(key);
    if (!current) {
      target.set(key, cloneSnapshot(snapshot));
      continue;
    }
    current.contractId = snapshot.contractId;
    current.spaces.splice(0, current.spaces.length, ...snapshot.spaces.map(cloneContractSpace));
    current.parties.splice(0, current.parties.length, ...snapshot.parties.map(clonePartyPeriod));
    current.deposits.splice(0, current.deposits.length, ...snapshot.deposits.map(cloneDeposit));
  }
}
export function cloneAuditEntry(entry: RentalAuditEntry): RentalAuditEntry {
  return { ...entry, metadata: cloneAuditValue(entry.metadata) as Record<string, unknown> };
}
export function cloneAuditValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value);
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(cloneAuditValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneAuditValue(item)]),
    );
  return value;
}
export function cloneArrayMap<K, V>(source: Map<K, V[]>, clone: (value: V) => V): Map<K, V[]> {
  return new Map([...source].map(([key, values]) => [key, values.map(clone)]));
}

export function createSpaceRecord(input: {
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
  note?: string | null;
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
    note: input.note ?? null,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.createdByUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function nextUuid(prefix: string, counter: number): string {
  return `${prefix}-${String(counter).padStart(12, "0")}`;
}

export function replaceMap<K, V>(
  target: Map<K, V>,
  source: Map<K, V>,
  clone: (value: V) => V = (value) => value,
): void {
  target.clear();
  for (const [key, value] of source) target.set(key, clone(value));
}

export function replaceArrayMap<K, V>(
  target: Map<K, V[]>,
  source: Map<K, V[]>,
  clone: (value: V) => V,
): void {
  for (const key of target.keys()) if (!source.has(key)) target.delete(key);
  for (const [key, values] of source) {
    const current = target.get(key);
    if (current) {
      current.splice(0, current.length, ...values.map(clone));
    } else {
      target.set(key, values.map(clone));
    }
  }
}
