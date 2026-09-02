import { organizations } from "../db/schema/identity.js";
import { rentalContractSpaces, rentalContracts, rentalSpaces } from "../db/schema.js";
import { SPACE_CONFLICT_QUERY_ADAPTER } from "../modules/rental/contract-conflicts.queries.js";
import { actualContractEnd } from "../modules/rental/contract-date.rules.js";
import type {
  AppendContractChangeInput,
  ContractSpaceConflictInput,
  CreateDraftContractInput,
  RentalContractDepositRecord,
  RentalContractRecord,
  RentalContractSpaceConflictRecord,
  RentalContractSpaceRecord,
  ReplaceContractPartyPeriodsInput,
  ReplaceDraftDepositsInput,
  ReplaceDraftPartiesInput,
  ReplaceDraftSpacesInput,
  SetContractLifecycleInput,
  UpdateContractHeaderInput,
} from "../modules/rental/contracts.repository.types.js";
import type { RentalSpaceRecord } from "../modules/rental/spaces.repository.types.js";
import type {
  RentalTenantRecord,
  SetRentalTenantStatusInput,
  SoftDeleteRentalTenantInput,
  UpdateRentalTenantInput,
} from "../modules/rental/tenants.repository.types.js";
import { testIds } from "./auth-test-helpers.js";
import type {
  RentalContractActionRecord,
  RentalContractChangeRecord,
  RentalContractSnapshotRecord,
  RentalPartyPeriodRecord,
  RentalTestState,
} from "./rental-test-state.js";

export type RentalMutationMethod =
  | "tenants.update"
  | "tenants.status"
  | "tenants.delete"
  | "relations.confirmSnapshots"
  | "relations.clipPartyPeriodsToActualEnd"
  | "relations.restoreTerminalPartyPeriods"
  | "relations.copyTerminalPartySetToDraft"
  | "relations.replacePartyPeriods"
  | "relations.appendChange"
  | "relations.appendTerminationRevocation"
  | "contracts.createDraft"
  | "contracts.updateHeader"
  | "contracts.setLifecycle"
  | "relations.replaceDraftSpaces"
  | "relations.replaceDraftParties"
  | "relations.replaceDraftDeposits";

export type RentalMutationInput =
  | UpdateRentalTenantInput
  | SetRentalTenantStatusInput
  | SoftDeleteRentalTenantInput
  | { organizationId: string; contractId: string }
  | { organizationId: string; contractId: string; actualEnd: string }
  | { organizationId: string; contractId: string; terminatedAt: string; originalEnd: string }
  | {
      organizationId: string;
      contractId: string;
      targetContractId: string;
      validFrom: string;
      validTo: string;
    }
  | ReplaceContractPartyPeriodsInput
  | AppendContractChangeInput
  | {
      organizationId: string;
      contractId: string;
      reason: string;
      terminationDateBeforeRevoke: string;
      createdByUserId: string;
    }
  | CreateDraftContractInput
  | UpdateContractHeaderInput
  | SetContractLifecycleInput
  | ReplaceDraftSpacesInput
  | ReplaceDraftPartiesInput
  | ReplaceDraftDepositsInput;

type RentalMutationCounterKey =
  | "nextPropertyId"
  | "nextSpaceId"
  | "nextLedgerId"
  | "nextTenantId"
  | "nextContractId"
  | "nextContractSpaceId"
  | "nextPartyPeriodId"
  | "nextChangeId"
  | "nextDepositId"
  | "nextSnapshotId"
  | "nextActionId";

export type RentalMutationEffect = {
  tenant?: { id: string; row: RentalTenantRecord | null };
  contract?: { id: string; row: RentalContractRecord | null };
  contractSpaces?: { contractId: string; rows: readonly RentalContractSpaceRecord[] | null };
  partyPeriods?: { contractId: string; rows: readonly RentalPartyPeriodRecord[] | null };
  changes?: { contractId: string; rows: readonly RentalContractChangeRecord[] | null };
  actions?: { contractId: string; rows: readonly RentalContractActionRecord[] | null };
  deposits?: { contractId: string; rows: readonly RentalContractDepositRecord[] | null };
  snapshots?: { contractId: string; row: RentalContractSnapshotRecord | null };
  counterEffects?: Partial<Record<RentalMutationCounterKey, number>>;
};

export type RentalMutationFixtureRegistry = {
  readonly mutationCalls: Array<{ method: RentalMutationMethod; input: RentalMutationInput }>;
  registerMutation(
    method: RentalMutationMethod,
    input: RentalMutationInput,
    effect: RentalMutationEffect,
  ): void;
  hasMutation(method: RentalMutationMethod, input: RentalMutationInput): boolean;
  resolveMutation(method: RentalMutationMethod, input: RentalMutationInput): RentalMutationEffect;
};

export type RentalContractNumberFixture = {
  contractNumber: string;
  counter: number;
};

type SpaceConflictFixtureRow = RentalContractSpaceConflictRecord;

export type RentalQueryFixtureRegistry = {
  readonly spaceConflictCalls: ContractSpaceConflictInput[];
  readonly readCalls: Array<{ method: string; args: unknown[] }>;
  registerSpaceConflict(
    input: ContractSpaceConflictInput,
    rows: readonly SpaceConflictFixtureRow[],
  ): void;
  resolveSpaceConflict(input: ContractSpaceConflictInput): Promise<SpaceConflictFixtureRow[]>;
  registerRead(method: string, args: readonly unknown[], result: unknown): void;
  registerReadSequence(method: string, args: readonly unknown[], results: readonly unknown[]): void;
  removeRead(method: string, args: readonly unknown[]): void;
  hasRead(method: string, args: readonly unknown[]): boolean;
  resetReadSequence(method: string, args: readonly unknown[]): void;
  resolveRead<T>(method: string, args: readonly unknown[]): T;
};

export function createRentalQueryFixtureRegistry(): RentalQueryFixtureRegistry {
  const fixtures = new Map<string, SpaceConflictFixtureRow[]>();
  const readFixtures = new Map<string, unknown>();
  const readSequences = new Map<string, { results: unknown[]; index: number }>();
  const spaceConflictCalls: ContractSpaceConflictInput[] = [];
  const readCalls: Array<{ method: string; args: unknown[] }> = [];
  return {
    spaceConflictCalls,
    readCalls,
    registerSpaceConflict(input, rows) {
      const key = spaceConflictFixtureKey(input);
      fixtures.set(key, rows.map(cloneSpaceConflictFixtureRow));
    },
    async resolveSpaceConflict(input) {
      const key = spaceConflictFixtureKey(input);
      const rows = fixtures.get(key);
      if (!rows) throw new Error("space-conflict fixture unavailable");
      spaceConflictCalls.push({ ...input, spaceIds: [...input.spaceIds] });
      return rows.map(cloneSpaceConflictFixtureRow);
    },
    registerRead(method, args, result) {
      if (!method || !Array.isArray(args)) {
        throw new Error("rental read fixture requires method and args");
      }
      readFixtures.set(readFixtureKey(method, args), cloneFixtureValue(result));
    },
    registerReadSequence(method, args, results) {
      if (!method || !Array.isArray(args) || results.length === 0)
        throw new Error("rental read fixture sequence requires method, args and results");
      const key = readFixtureKey(method, args);
      readSequences.set(key, {
        results: results.map(cloneFixtureValue),
        index: 0,
      });
    },
    removeRead(method, args) {
      const key = readFixtureKey(method, args);
      readFixtures.delete(key);
      readSequences.delete(key);
    },
    hasRead(method, args) {
      const key = readFixtureKey(method, args);
      return readFixtures.has(key) || readSequences.has(key);
    },
    resetReadSequence(method, args) {
      const key = readFixtureKey(method, args);
      const sequence = readSequences.get(key);
      if (!sequence)
        throw new Error(`rental read fixture sequence unavailable: ${method} (${key})`);
      sequence.index = 0;
    },
    resolveRead<T>(method: string, args: readonly unknown[]): T {
      const key = readFixtureKey(method, args);
      const sequence = readSequences.get(key);
      if (sequence) {
        const result = sequence.results[Math.min(sequence.index++, sequence.results.length - 1)];
        readCalls.push({ method, args: cloneFixtureValue(args) as unknown[] });
        return cloneFixtureValue(result) as T;
      }
      if (!readFixtures.has(key))
        throw new Error(`rental read fixture unavailable: ${method} (${key})`);
      readCalls.push({ method, args: cloneFixtureValue(args) as unknown[] });
      return cloneFixtureValue(readFixtures.get(key)) as T;
    },
  };
}

export function createRentalMutationFixtureRegistry(): RentalMutationFixtureRegistry {
  const fixtures = new Map<string, RentalMutationEffect>();
  const mutationCalls: RentalMutationFixtureRegistry["mutationCalls"] = [];
  return {
    mutationCalls,
    registerMutation(method, input, effect) {
      fixtures.set(mutationFixtureKey(method, input), cloneFixtureValue(effect));
    },
    hasMutation(method, input) {
      return fixtures.has(JSON.stringify([method, normalizeFixtureValue(input)]));
    },
    resolveMutation(method, input) {
      const key = mutationFixtureKey(method, input);
      const effect = fixtures.get(key);
      if (!effect) throw new Error(`rental mutation fixture unavailable: ${method} (${key})`);
      mutationCalls.push({ method, input: cloneFixtureValue(input) });
      return cloneFixtureValue(effect);
    },
  };
}

function mutationFixtureKey(method: RentalMutationMethod, input: RentalMutationInput): string {
  const expectedKeys: Record<RentalMutationMethod, string> = {
    "tenants.update":
      "documentCountryCode,documentNumberLookupHash,documentType,documentTypeOtherName,email,id,isActive,maskedDocumentNumber,name,note,organizationId,phone,primaryContactName,sensitiveIdentityCiphertext,sensitiveIdentityKeyVersion,type,updatedByUserId",
    "tenants.status": "id,isActive,organizationId,updatedByUserId",
    "tenants.delete": "deletedByUserId,id,organizationId,updatedByUserId",
    "relations.confirmSnapshots": "contractId,organizationId",
    "relations.clipPartyPeriodsToActualEnd": "actualEnd,contractId,organizationId",
    "relations.restoreTerminalPartyPeriods": "contractId,organizationId,originalEnd,terminatedAt",
    "relations.copyTerminalPartySetToDraft":
      "contractId,organizationId,targetContractId,validFrom,validTo",
    "relations.replacePartyPeriods": "contractId,effectiveDate,organizationId,parties",
    "relations.appendChange":
      "afterPartyRefs,beforePartyRefs,contractId,createdByUserId,effectiveDate,organizationId,reason,type",
    "relations.appendTerminationRevocation":
      "contractId,createdByUserId,organizationId,reason,terminationDateBeforeRevoke",
    "contracts.createDraft":
      "billingAnchor,contractNumber,createdByUserId,dueDaysBefore,endDate,externalContractNumber,note,organizationId,paymentIntervalMonths,propertyId,renewedFromContractId,rentAmountMinor,startDate,updatedByUserId",
    "contracts.updateHeader":
      "billingAnchor,dueDaysBefore,endDate,externalContractNumber,id,note,organizationId,paymentIntervalMonths,propertyId,rentAmountMinor,startDate,updatedByUserId",
    "contracts.setLifecycle": "id,organizationId,status,updatedByUserId",
    "relations.replaceDraftSpaces": "contractId,organizationId,propertyId,spaces",
    "relations.replaceDraftParties": "contractId,organizationId,parties",
    "relations.replaceDraftDeposits": "contractId,deposits,organizationId",
  };
  const keys = Object.keys(input).sort().join(",");
  if (
    method === "contracts.setLifecycle" &&
    ![
      "id,organizationId,status,updatedByUserId",
      "cancellationReason,cancelledAt,cancelledByUserId,id,organizationId,status,updatedByUserId",
      "expectedStatus,id,organizationId,status,terminatedByUserId,terminationDate,terminationReason,terminationRecordedAt,updatedByUserId",
    ].includes(keys)
  ) {
    throw new Error(
      `rental mutation fixture requires an exact tuple: ${method} (received ${keys})`,
    );
  }
  if (method !== "contracts.setLifecycle" && keys !== expectedKeys[method])
    throw new Error(
      `rental mutation fixture requires an exact tuple: ${method} (received ${keys})`,
    );
  return JSON.stringify([method, normalizeFixtureValue(input)]);
}

export function applyRentalMutationEffect(
  state: RentalTestState,
  effect: RentalMutationEffect,
): void {
  if (effect.contract) {
    if (effect.contract.row === null) state.contracts.delete(effect.contract.id);
    else state.contracts.set(effect.contract.id, cloneFixtureValue(effect.contract.row));
  }
  if (effect.contractSpaces) {
    if (effect.contractSpaces.rows === null)
      state.contractSpaces.delete(effect.contractSpaces.contractId);
    else
      state.contractSpaces.set(
        effect.contractSpaces.contractId,
        effect.contractSpaces.rows.map(cloneFixtureValue),
      );
  }
  if (effect.tenant) {
    if (effect.tenant.row === null) state.tenants.delete(effect.tenant.id);
    else state.tenants.set(effect.tenant.id, cloneFixtureValue(effect.tenant.row));
  }
  if (effect.partyPeriods) {
    if (effect.partyPeriods.rows === null)
      state.partyPeriods.delete(effect.partyPeriods.contractId);
    else
      state.partyPeriods.set(
        effect.partyPeriods.contractId,
        effect.partyPeriods.rows.map(cloneFixtureValue),
      );
  }
  if (effect.changes) {
    if (effect.changes.rows === null) state.changes.delete(effect.changes.contractId);
    else state.changes.set(effect.changes.contractId, effect.changes.rows.map(cloneFixtureValue));
  }
  if (effect.actions) {
    if (effect.actions.rows === null) state.actions.delete(effect.actions.contractId);
    else state.actions.set(effect.actions.contractId, effect.actions.rows.map(cloneFixtureValue));
  }
  if (effect.deposits) {
    if (effect.deposits.rows === null) state.deposits.delete(effect.deposits.contractId);
    else
      state.deposits.set(effect.deposits.contractId, effect.deposits.rows.map(cloneFixtureValue));
  }
  if (effect.snapshots) {
    if (effect.snapshots.row === null) state.snapshots.delete(effect.snapshots.contractId);
    else state.snapshots.set(effect.snapshots.contractId, cloneFixtureValue(effect.snapshots.row));
  }
  for (const [counter, delta] of Object.entries(effect.counterEffects ?? {})) {
    state[counter as RentalMutationCounterKey] += delta ?? 0;
  }
}

function readFixtureKey(method: string, args: readonly unknown[]): string {
  if (!method || !Array.isArray(args))
    throw new Error("rental read fixture requires method and args");
  return JSON.stringify([method, normalizeFixtureValue(args)]);
}

function normalizeFixtureValue(value: unknown): unknown {
  if (value === undefined) return ["undefined"];
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (value instanceof Date) return ["date", value.toISOString()];
  if (Buffer.isBuffer(value)) return ["buffer", value.toString("base64")];
  if (Array.isArray(value)) return value.map(normalizeFixtureValue);
  if (value instanceof Map)
    return [
      "map",
      [...value.entries()]
        .map(([key, entry]) => [normalizeFixtureValue(key), normalizeFixtureValue(entry)])
        .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    ];
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeFixtureValue(entry)]),
    );
  }
  throw new Error("rental read fixture contains unsupported value");
}

function cloneFixtureValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value) as T;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map((entry) => cloneFixtureValue(entry)) as T;
  if (value instanceof Map)
    return new Map(
      [...value.entries()].map(([key, entry]) => [
        cloneFixtureValue(key),
        cloneFixtureValue(entry),
      ]),
    ) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneFixtureValue(entry)]),
  ) as T;
}

function spaceConflictFixtureKey(input: ContractSpaceConflictInput): string {
  const keys = Object.keys(input).sort().join(",");
  const requiredKeys = "endDate,organizationId,propertyId,spaceIds,startDate";
  const optionalKeys = "endDate,excludeContractId,organizationId,propertyId,spaceIds,startDate";
  if (keys !== requiredKeys && keys !== optionalKeys) {
    throw new Error("space-conflict fixture requires an exact input tuple");
  }
  if (
    typeof input.organizationId !== "string" ||
    typeof input.propertyId !== "string" ||
    !Array.isArray(input.spaceIds) ||
    typeof input.startDate !== "string" ||
    typeof input.endDate !== "string" ||
    (input.excludeContractId !== undefined && typeof input.excludeContractId !== "string")
  ) {
    throw new Error("space-conflict fixture requires an exact input tuple");
  }
  if (input.spaceIds.length === 0) throw new Error("space-conflict fixture requires space ids");
  if (new Set(input.spaceIds).size !== input.spaceIds.length)
    throw new Error("duplicate space id in space-conflict fixture");
  const values = [
    input.organizationId,
    input.propertyId,
    [...input.spaceIds].sort(),
    input.startDate,
    input.endDate,
    input.excludeContractId ?? null,
  ];
  return JSON.stringify(values);
}

function cloneSpaceConflictFixtureRow(row: SpaceConflictFixtureRow): SpaceConflictFixtureRow {
  if (
    Object.keys(row).sort().join(",") !== "contractId,contractNumber,spaceId" ||
    typeof row.contractId !== "string" ||
    typeof row.contractNumber !== "string" ||
    typeof row.spaceId !== "string"
  ) {
    throw new Error("space-conflict fixture row must contain only safe identifiers");
  }
  return { ...row };
}

export function createRentalDatabaseFake(
  state?: RentalTestState,
  registry: RentalQueryFixtureRegistry = createRentalQueryFixtureRegistry(),
) {
  return {
    [SPACE_CONFLICT_QUERY_ADAPTER]: true as const,
    spaceConflict: (input: ContractSpaceConflictInput) => registry.resolveSpaceConflict(input),
    select: (fields?: unknown) => {
      if (
        !fields ||
        typeof fields !== "object" ||
        Object.keys(fields).length !== 1 ||
        !("timezone" in fields) ||
        (fields as { timezone?: unknown }).timezone !== organizations.timezone
      ) {
        throw new Error("Rental test database capability unavailable: select");
      }
      let fromTable: unknown;
      let whereQuery: unknown;
      return {
        from: (table: unknown) => {
          fromTable = table;
          return {
            where: (query: unknown) => {
              whereQuery = query;
              return {
                limit: async (limit: unknown) => {
                  const whereText = readSqlText(whereQuery).join(" ");
                  const whereValues = readSqlPrimitiveValues(whereQuery);
                  const whereChunks =
                    whereQuery &&
                    typeof whereQuery === "object" &&
                    "queryChunks" in whereQuery &&
                    Array.isArray(whereQuery.queryChunks)
                      ? (whereQuery.queryChunks as unknown[])
                      : [];
                  const [wherePrefix, whereColumn, whereOperator, whereValue, whereSuffix] =
                    whereChunks;
                  const organizationIds = [
                    ...new Set(
                      whereValues.filter((value) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)),
                    ),
                  ];
                  if (
                    fromTable !== organizations ||
                    limit !== 1 ||
                    whereChunks.length !== 5 ||
                    readSqlText(wherePrefix).join("") !== "" ||
                    !whereColumn ||
                    typeof whereColumn !== "object" ||
                    !("name" in whereColumn) ||
                    whereColumn.name !== "id" ||
                    !("table" in whereColumn) ||
                    whereColumn.table !== organizations ||
                    readSqlText(whereOperator).join("") !== " = " ||
                    readSqlChunkValue(whereValue) !== organizationIds[0] ||
                    readSqlText(whereSuffix).join("") !== "" ||
                    !whereText.includes("=") ||
                    organizationIds.length !== 1
                  ) {
                    throw new Error("Rental test database capability unavailable: select");
                  }
                  return organizationIds[0] === testIds.organization ||
                    organizationIds[0] === testIds.otherOrganization
                    ? [{ timezone: "Asia/Shanghai" }]
                    : [];
                },
              };
            },
          };
        },
      };
    },
    execute: async (query: unknown) => {
      if (!state) {
        throw new Error("Rental test database capability unavailable: execute");
      }
      const chunks =
        query &&
        typeof query === "object" &&
        "queryChunks" in query &&
        Array.isArray(query.queryChunks)
          ? (query.queryChunks as unknown[])
          : [];
      const queryText = chunks.flatMap(readSqlText).join(" ");
      const isSpaceConflictQuery = [
        "/* rental.space-conflict.v1 */",
        'WITH RECURSIVE "requested_spaces"',
        '"space_ancestors"',
        '"space_descendants"',
        '"candidate_spaces"',
        "SELECT DISTINCT",
        '"organization_id"',
        '"property_id"',
        '"deleted_at"',
        '"start_date"',
        '"end_date"',
        'COALESCE("contract"."termination_date", "contract"."end_date")',
      ].every((marker) => queryText.includes(marker));
      const hasSpaceConflictTables = [rentalSpaces, rentalContractSpaces, rentalContracts].every(
        (table) => containsQueryObject(query, table),
      );
      if (!isSpaceConflictQuery || !hasSpaceConflictTables) {
        throw new Error("Rental test database capability unavailable: execute");
      }
      const parameters = collectSqlParameters(query);
      const organizationParameters = parameters.filter(({ context }) =>
        /"organization_id" = $/.test(context),
      );
      const propertyParameters = parameters.filter(({ context }) =>
        /"property_id" = $/.test(context),
      );
      const spaceIdParameters = parameters.filter(({ context }) =>
        /"space"\."id" = ANY\($/.test(context),
      );
      const startDateParameters = parameters.filter(({ context }) =>
        /"contract"\."start_date" <= $/.test(context),
      );
      const endDateParameters = parameters.filter(({ context }) =>
        /COALESCE\("contract"\."termination_date", "contract"\."end_date"\) >= $/.test(context),
      );
      const excludeParameters = parameters.filter(({ context }) =>
        /"contract"\."id" <> $/.test(context),
      );
      const organizationValues = organizationParameters.map(({ value }) => value);
      const propertyValues = propertyParameters.map(({ value }) => value);
      const spaceIdValues = spaceIdParameters.map(({ value }) => value);
      const startDateValues = startDateParameters.map(({ value }) => value);
      const endDateValues = endDateParameters.map(({ value }) => value);
      const excludeValues = excludeParameters.map(({ value }) => value);
      const recognizedParameters = new Set([
        ...organizationParameters,
        ...propertyParameters,
        ...spaceIdParameters,
        ...startDateParameters,
        ...endDateParameters,
        ...excludeParameters,
      ]);
      const hasUnknownScopedValue = parameters.some(
        (parameter) =>
          typeof parameter.value === "string" &&
          (isUuid(parameter.value) || /^\d{4}-\d{2}-\d{2}$/.test(parameter.value)) &&
          !recognizedParameters.has(parameter),
      );
      const organizationId = organizationValues[0];
      const propertyId = propertyValues[0];
      const spaceIds = spaceIdValues[0];
      const startDate = endDateValues[0];
      const endDate = startDateValues[0];
      const excludeContractId = excludeValues[0];
      if (
        organizationValues.length === 5 &&
        propertyValues.length === 4 &&
        organizationValues.every((value) => value === organizationId) &&
        propertyValues.every((value) => value === propertyId) &&
        spaceIdValues.length === 1 &&
        Array.isArray(spaceIds) &&
        spaceIds.length > 0 &&
        spaceIds.every((value) => typeof value === "string" && isUuid(value)) &&
        startDateValues.length === 1 &&
        endDateValues.length === 1 &&
        typeof startDate === "string" &&
        typeof endDate === "string" &&
        excludeValues.length <= 1 &&
        (!excludeContractId ||
          (typeof excludeContractId === "string" && isUuid(excludeContractId))) &&
        !hasUnknownScopedValue
      ) {
        const requestedSpaces = spaceIds.map((id) => state.spaces.get(id));
        if (
          requestedSpaces.some(
            (space) =>
              !space ||
              space.organizationId !== organizationId ||
              space.propertyId !== propertyId ||
              space.deletedAt !== null,
          )
        ) {
          throw new Error("Rental test database capability unavailable: execute");
        }
        if (
          typeof organizationId !== "string" ||
          typeof propertyId !== "string" ||
          !Array.isArray(spaceIds) ||
          !spaceIds.every((value): value is string => typeof value === "string") ||
          typeof startDate !== "string" ||
          typeof endDate !== "string"
        ) {
          throw new Error("Rental test database capability unavailable: execute");
        }
        const validatedExcludeContractId =
          typeof excludeContractId === "string" ? excludeContractId : undefined;
        return _spaceConflict(state, {
          organizationId,
          propertyId,
          spaceIds,
          startDate,
          endDate,
          ...(validatedExcludeContractId ? { excludeContractId: validatedExcludeContractId } : {}),
        });
      }
      throw new Error("Rental test database capability unavailable: execute");
    },
  };
}

function readSqlChunkValue(chunk: unknown): unknown {
  if (chunk && typeof chunk === "object" && "value" in chunk)
    return (chunk as { value: unknown }).value;
  if (chunk instanceof String) return chunk.toString();
  return chunk;
}

type SqlParameter = { value: unknown; context: string };

function collectSqlParameters(value: unknown): SqlParameter[] {
  const result: SqlParameter[] = [];
  const walk = (current: unknown, context: string): string => {
    if (Array.isArray(current)) {
      let nextContext = context;
      for (const item of current) nextContext = walk(item, nextContext);
      return nextContext;
    }
    if (current && typeof current === "object" && "queryChunks" in current) {
      return walk((current as { queryChunks: unknown[] }).queryChunks, context);
    }
    if (current && typeof current === "object" && "value" in current) {
      const chunkValue = (current as { value: unknown }).value;
      if (Array.isArray(chunkValue) && chunkValue.every((item) => typeof item === "string")) {
        if (current.constructor?.name === "StringChunk") return `${context}${chunkValue.join("")}`;
        result.push({ value: chunkValue, context });
        return context;
      }
      result.push({ value: chunkValue, context });
      return context;
    }
    if (current instanceof String) {
      result.push({ value: current.toString(), context });
      return context;
    }
    if (typeof current === "string") {
      result.push({ value: current, context });
      return context;
    }
    if (typeof current === "number" || typeof current === "boolean") {
      result.push({ value: current, context });
    }
    return context;
  };
  walk(value, "");
  return result;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

function readSqlText(chunk: unknown): string[] {
  if (chunk && typeof chunk === "object" && "queryChunks" in chunk)
    return readSqlText((chunk as { queryChunks: unknown[] }).queryChunks);
  const value = readSqlChunkValue(chunk);
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(readSqlText);
  return [];
}

function readSqlPrimitiveValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(readSqlPrimitiveValues);
  if (value && typeof value === "object" && "queryChunks" in value)
    return readSqlPrimitiveValues((value as { queryChunks: unknown[] }).queryChunks);
  if (value && typeof value === "object" && "value" in value)
    return readSqlPrimitiveValues((value as { value: unknown }).value);
  return [];
}

function containsQueryObject(value: unknown, target: object, seen = new Set<object>()): boolean {
  if (value === target) return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsQueryObject(item, target, seen));
  return Object.values(value).some((item) => containsQueryObject(item, target, seen));
}

export function _spaceConflict(
  state: RentalTestState,
  input: {
    organizationId: string;
    propertyId: string;
    spaceIds: string[];
    startDate: string;
    endDate: string;
    excludeContractId?: string;
  },
): RentalContractSpaceConflictRecord[] {
  const selected = input.spaceIds
    .map((id) => state.spaces.get(id))
    .filter((space): space is RentalSpaceRecord => Boolean(space));
  const result: RentalContractSpaceConflictRecord[] = [];
  for (const contract of state.contracts.values()) {
    if (
      contract.organizationId !== input.organizationId ||
      contract.propertyId !== input.propertyId ||
      contract.id === input.excludeContractId ||
      contract.deletedAt !== null ||
      !["confirmed", "terminated"].includes(contract.status) ||
      !contract.startDate ||
      !contract.endDate
    )
      continue;
    const actualEnd = actualContractEnd(contract.endDate, contract.terminationDate);
    if (contract.startDate > input.endDate || actualEnd < input.startDate) continue;
    for (const existing of state.contractSpaces.get(contract.id) ?? []) {
      if (selected.some((candidate) => sameSpaceBranch(state, candidate.id, existing.spaceId)))
        result.push({
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          spaceId: existing.spaceId,
        });
    }
  }
  return result;
}

export function sameSpaceBranch(state: RentalTestState, leftId: string, rightId: string): boolean {
  if (leftId === rightId) return true;
  const leftPath = state.spaces.get(leftId)
    ? listAncestors(state, state.spaces.get(leftId) as RentalSpaceRecord).map(({ id }) => id)
    : [];
  const rightPath = state.spaces.get(rightId)
    ? listAncestors(state, state.spaces.get(rightId) as RentalSpaceRecord).map(({ id }) => id)
    : [];
  return leftPath.includes(rightId) || rightPath.includes(leftId);
}

export function listAncestors(state: RentalTestState, space: RentalSpaceRecord) {
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

export function listDescendantIds(
  state: RentalTestState,
  organizationId: string,
  propertyId: string,
  id: string,
): string[] {
  const descendants: string[] = [];
  const pending = [id];
  while (pending.length > 0) {
    const parentId = pending.shift();
    if (!parentId) continue;
    for (const space of state.spaces.values()) {
      if (
        space.organizationId === organizationId &&
        space.propertyId === propertyId &&
        space.deletedAt === null &&
        space.parentId === parentId
      ) {
        descendants.push(space.id);
        pending.push(space.id);
      }
    }
  }
  return descendants;
}
