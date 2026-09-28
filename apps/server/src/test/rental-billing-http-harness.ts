import type { RentalContractDetail } from "@xpense/shared";
import type { BillingSource } from "../modules/rental/billing.types.js";
import { finalDepositAmount } from "../modules/rental/contract.rules.js";
import { ContractRelationsRepository } from "../modules/rental/contract-relations.repository.js";
import { ContractsRepository } from "../modules/rental/contracts.repository.js";
import type { RentalContractDetailRecord } from "../modules/rental/contracts.repository.types.js";
import { ContractsPolicyService } from "../modules/rental/contracts-policy.service.js";
import { login, parseJson, TEST_PHONES, testIds } from "./auth-test-helpers.js";
import { createTestApp, type TestAppHarness, type TestAppOptions } from "./create-test-app.js";
import { rentalBillingSource } from "./rental-billing-fixtures.js";
import { createContractRecord, FIXED_RENTAL_NOW, rentalTestIds } from "./rental-test-state.js";

/** HTTP 全流程用固定关联；合同与账单仍由真实 services 在共用事务状态写入。 */
export async function createRentalBillingHttpHarness(
  overrides: Partial<RentalContractDetail> = {},
  options: TestAppOptions = {},
): Promise<
  TestAppHarness & {
    source: BillingSource;
    headers: { authorization: string };
    request: (url: string, payload?: unknown) => Promise<{ payload: string; statusCode: number }>;
    parse: <T>(response: { payload: string; statusCode: number }) => T;
    now: Date;
  }
> {
  const setup = await createTestApp({ rental: true, ...options });
  const source = rentalBillingSource({
    id: rentalTestIds.contract,
    propertyId: rentalTestIds.property,
    ...overrides,
  });
  const state = setup.state.rental;
  source.contract.spaces = [
    {
      spaceId: rentalTestIds.childSpace,
      spaceName: "测试房间",
      spaceCode: null,
      spacePath: [
        { id: rentalTestIds.parentSpace, name: "测试楼栋" },
        { id: rentalTestIds.childSpace, name: "测试房间" },
      ],
      rentAllocationMinor: null,
    },
  ];
  source.contract.parties.forEach((party) => {
    party.tenantId = rentalTestIds.tenant;
    party.validFrom = source.contract.startDate;
    party.validTo = source.contract.endDate;
  });
  state.contracts.set(
    source.contract.id,
    createContractRecord({
      id: source.contract.id,
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      contractNumber: source.contract.contractNumber,
      createdByUserId: testIds.ownerUser,
      status: source.contract.lifecycleStatus,
      startDate: source.contract.startDate,
      endDate: source.contract.endDate,
      rentAmountMinor: source.contract.rentAmountMinor,
      billingAnchor: source.contract.billingAnchor,
      paymentIntervalMonths: source.contract.paymentIntervalMonths,
      dueDaysBefore: source.contract.dueDaysBefore,
    }),
  );
  state.deposits.set(source.contract.id, structuredClone(source.contract.depositTerms));
  const contracts: Partial<ContractsRepository> = {
    find: async (org, id) => {
      const header = state.contracts.get(id);
      return header?.organizationId === org ? header : null;
    },
    findForUpdate: async (org, id) => {
      const header = state.contracts.get(id);
      return header?.organizationId === org ? header : null;
    },
    detail: async (org, id) => {
      const header = state.contracts.get(id);
      if (!header || header.organizationId !== org) return null;
      const detail = {
        ...source.contract,
        ...header,
        lifecycleStatus: header.status,
        terminationDate: header.terminationDate,
        updatedAt: header.updatedAt,
        createdAt: header.createdAt,
        depositTerms: state.deposits.get(id) ?? [],
        parties: source.contract.parties.map((party) => ({
          ...party,
          validTo: header.terminationDate ?? header.endDate,
          tenantType: party.type,
          tenantName: party.name,
        })),
      };
      return detail as RentalContractDetailRecord;
    },
    updateHeader: async (input) => {
      const header = state.contracts.get(input.id);
      if (!header || header.organizationId !== input.organizationId)
        throw new Error("missing contract");
      const next = { ...header, ...input, updatedAt: new Date() };
      state.contracts.set(input.id, next);
      return next;
    },
    setLifecycle: async (input) => {
      const header = state.contracts.get(input.id);
      if (!header || header.organizationId !== input.organizationId)
        throw new Error("missing contract");
      const next = { ...header, ...input, updatedAt: new Date() };
      state.contracts.set(input.id, next);
      return next;
    },
  };
  const relations: Partial<ContractRelationsRepository> = {
    replaceDraftSpaces: async () => {},
    replaceDraftParties: async () => {},
    replaceDraftDeposits: async (input) => {
      state.deposits.set(
        input.contractId,
        input.deposits.map((term, index) => ({
          ...term,
          id: source.contract.depositTerms[index]?.id ?? source.contract.id,
          finalAmountMinor: null,
        })),
      );
    },
    confirmSnapshots: async (input) => {
      const header = state.contracts.get(input.contractId);
      if (!header) throw new Error("missing contract");
      for (const term of state.deposits.get(input.contractId) ?? [])
        term.finalAmountMinor = finalDepositAmount(term, header.rentAmountMinor as number);
    },
    clipPartyPeriodsToActualEnd: async (input) => {
      const periods = state.partyPeriods.get(input.contractId) ?? [];
      for (const period of periods) period.validTo = input.actualEnd;
    },
    restoreTerminalPartyPeriods: async (input) => {
      const periods = state.partyPeriods.get(input.contractId) ?? [];
      for (const period of periods) period.validTo = input.originalEnd;
    },
    appendTerminationRevocation: async () => {},
  };
  Object.assign(setup.app.get(ContractsRepository), contracts);
  Object.assign(setup.app.get(ContractRelationsRepository), relations);
  const policy: Partial<ContractsPolicyService> = {
    validateConfirmationScope: async () => ({
      property: state.properties.get(rentalTestIds.property) as never,
      spaces: [],
      tenants: [],
    }),
  };
  Object.assign(setup.app.get(ContractsPolicyService), policy);
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    state.properties.get(rentalTestIds.property),
  );
  setup.state.rentalQuery.registerRead(
    "tenants.findForUpdate",
    [testIds.organization, rentalTestIds.tenant],
    state.tenants.get(rentalTestIds.tenant),
  );
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, rentalTestIds.childSpace],
    state.spaces.get(rentalTestIds.childSpace),
  );
  setup.state.rentalQuery.registerRead(
    "spaces.ancestors",
    [testIds.organization, rentalTestIds.property, source.contract.spaces[0]?.spaceId],
    source.contract.spaces[0]?.spacePath ?? [],
  );
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, source.contract.spaces[0]?.spaceId],
    { ...state.spaces.get(rentalTestIds.childSpace), id: source.contract.spaces[0]?.spaceId },
  );
  const tokens = await login(setup.app, TEST_PHONES.owner);
  const headers = { authorization: `Bearer ${tokens.accessToken}` };
  return {
    ...setup,
    source,
    headers,
    request: async (url: string, payload?: unknown) =>
      setup.app.inject({
        method: payload === undefined ? "GET" : "POST",
        url: `/api${url}`,
        headers,
        ...(payload === undefined ? {} : { payload: payload as never }),
      }),
    parse: <T>(response: { payload: string; statusCode: number }) =>
      parseJson<{ data: T }>(response).data,
    now: FIXED_RENTAL_NOW,
  };
}
