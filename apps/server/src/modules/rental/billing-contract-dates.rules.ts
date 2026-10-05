import { contractCalendarDay, normalizeStoredContractTime } from "./contract-time.rules.js";

type ContractDates = {
  startDate: string | null;
  endDate: string | null;
  actualEndDate?: string | null;
};

/** 财务仍按覆盖的日历天计算，合同秒级时间只在财务来源边界投影为日期。 */
export function toBillingContractDates<T extends ContractDates>(contract: T): T {
  const day = (value: string | null, boundary: "start" | "end") => {
    const localTime = normalizeStoredContractTime(value, boundary);
    return localTime === null ? null : contractCalendarDay(localTime);
  };
  return {
    ...contract,
    startDate: day(contract.startDate, "start"),
    endDate: day(contract.endDate, "end"),
    ...(contract.actualEndDate === undefined
      ? {}
      : {
          actualEndDate: day(contract.actualEndDate, "end"),
        }),
  };
}
