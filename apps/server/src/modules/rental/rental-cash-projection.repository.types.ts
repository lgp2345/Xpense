import type { RentalCashTarget } from "@xpense/shared";

/** 版本和余额读取所需的持久化合同资金事实，不含详情展示字段。 */
export type RentalCashProjectionFacts = {
  organizationId: string;
  contractId: string;
  contract: {
    billingMode: string;
    lifecycleStatus: string;
    startDate: string | null;
    endDate: string | null;
    rentAmountMinor: number | null;
    billingAnchor: string | null;
    paymentIntervalMonths: number | null;
    dueDaysBefore: number | null;
    terminationDate: string | null;
    cancelledAt: Date | null;
  };
  bills: Array<{
    id: string;
    type: string;
    status: string;
    modelVersion: number;
    billingMonth: string | null;
    revision: number;
    amountMinor: number;
    sourceKey: string;
    dueDate: string;
  }>;
  cashEntries: Array<{
    id: string;
    contractId: string;
    billId: string | null;
    settlementId: string | null;
    target?: RentalCashTarget;
    kind: string;
    purpose: string;
    amountMinor: number;
    occurredOn: string;
    revokedAt: Date | null;
  }>;
  settlement: {
    id: string;
    eventId: string;
    kind: string;
    effectiveEndDate: string;
    revision: number;
    finalCostMinor: number;
    status: string;
  } | null;
  settlementBillIds: string[];
  readings: Array<{
    id: string;
    kind: string;
    readingDate: string;
    reading: string;
    revision: number;
    predecessorId: string | null;
  }>;
};
