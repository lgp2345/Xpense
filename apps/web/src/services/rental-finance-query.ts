import type { QueryClient, QueryKey } from "@tanstack/react-query";

type FinanceResource = "charges" | "meters" | "bills" | "cash" | "settlements";
type FinanceFilters = Readonly<Record<string, string | number | boolean | undefined>>;

function key(
  organizationId: string,
  resource: FinanceResource,
  resourceId: string,
  filters: FinanceFilters = {},
) {
  return ["rental", organizationId, "finance", resource, resourceId, filters] as const;
}

/** 租赁财务查询的组织、资源、资源标识和筛选边界。 */
export const rentalFinanceKeys = {
  root: (organizationId: string) => ["rental", organizationId, "finance"] as const,
  chargeTerms: (organizationId: string, contractId: string) =>
    key(organizationId, "charges", contractId),
  meterBaseline: (organizationId: string, contractId: string) =>
    key(organizationId, "meters", contractId),
  contractBills: (organizationId: string, contractId: string, filters: FinanceFilters = {}) =>
    key(organizationId, "bills", contractId, filters),
  billCash: (
    organizationId: string,
    contractId: string,
    billId: string,
    filters: FinanceFilters = {},
  ) => key(organizationId, "cash", contractId, { ...filters, billId }),
  settlementCash: (
    organizationId: string,
    contractId: string,
    settlementId: string,
    filters: FinanceFilters = {},
  ) => key(organizationId, "cash", contractId, { ...filters, settlementId }),
  billRevisions: (
    organizationId: string,
    contractId: string,
    billId: string,
    filters: FinanceFilters = {},
  ) => key(organizationId, "bills", contractId, { ...filters, billId, view: "revisions" }),
  settlement: (organizationId: string, contractId: string) =>
    key(organizationId, "settlements", contractId),
  settlementHistory: (organizationId: string, contractId: string, filters: FinanceFilters = {}) =>
    key(organizationId, "settlements", contractId, { ...filters, view: "history" }),
};

function isKeyForOrganization(queryKey: QueryKey, organizationId: string): boolean {
  return queryKey[0] === "rental" && queryKey[1] === organizationId;
}

function contractFilter(queryKey: QueryKey, filtersIndex: number): string | undefined {
  const filters = queryKey[filtersIndex];
  if (!filters || typeof filters !== "object") return undefined;
  const contractId = (filters as Record<string, unknown>).contractId;
  return typeof contractId === "string" && contractId.length > 0 ? contractId : undefined;
}

function isLegacyBillList(queryKey: QueryKey): boolean {
  return queryKey[2] === "bills" && queryKey[3] === "list";
}

function isLegacyBillDetail(queryKey: QueryKey): boolean {
  return queryKey[2] === "bills" && queryKey[3] === "detail";
}

/**
 * 刷新指定合同的财务数据，同时更新当前组织的全合同账单列表。
 * 其他组织、其他合同的限定列表及详情保持缓存。
 */
export async function invalidateRentalFinance(
  queryClient: QueryClient,
  organizationId: string,
  contractId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const queryKey = query.queryKey;
      if (!isKeyForOrganization(queryKey, organizationId)) return false;

      if (queryKey[2] === "finance") {
        const resource = queryKey[3];
        return (
          (resource === "charges" ||
            resource === "meters" ||
            resource === "bills" ||
            resource === "cash" ||
            resource === "settlements") &&
          (queryKey[4] === contractId || contractFilter(queryKey, 5) === contractId)
        );
      }

      if (isLegacyBillList(queryKey)) {
        const filterContractId = contractFilter(queryKey, 4);
        return filterContractId === undefined || filterContractId === contractId;
      }

      if (isLegacyBillDetail(queryKey)) {
        const data = query.state.data;
        return Boolean(
          data &&
            typeof data === "object" &&
            "contractId" in data &&
            data.contractId === contractId,
        );
      }

      return false;
    },
  });
}
