import type { ListRentalBillsQuery } from "@xpense/shared";
import { isCalendarDate } from "../contracts/contract-action-model";
export function validateRentalBillsSearch(search: Record<string, unknown>): ListRentalBillsQuery {
  const result: ListRentalBillsQuery = {};
  for (const key of ["keyword", "contractId", "propertyId"] as const) {
    const value = search[key];
    if (typeof value === "string" && value.trim()) result[key] = value.trim();
  }
  if (search.type === "rent" || search.type === "deposit") result.type = search.type;
  if (search.status === "active" || search.status === "voided") result.status = search.status;
  for (const key of ["dueDateFrom", "dueDateTo"] as const) {
    const value = search[key];
    if (typeof value === "string" && isCalendarDate(value)) result[key] = value;
  }
  for (const key of ["page", "pageSize"] as const) {
    const value =
      typeof search[key] === "string" || typeof search[key] === "number"
        ? Number(search[key])
        : NaN;
    if (Number.isSafeInteger(value) && value > 0 && (key !== "pageSize" || value <= 100))
      result[key] = value;
  }
  return result;
}
