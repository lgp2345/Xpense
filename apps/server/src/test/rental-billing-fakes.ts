import { randomUUID } from "node:crypto";
import type { RentalBillDetail } from "@xpense/shared";
import type { BillAdjustmentsRepository } from "../modules/rental/bill-adjustments.repository.js";
import { billingTotals } from "../modules/rental/billing-plan.rules.js";
import type { BillsRepository } from "../modules/rental/bills.repository.js";
import { rentalBillingDetail } from "./rental-billing-fixtures.js";
import type { RentalTestState } from "./rental-test-state.js";

/** E2E 账单仓储与合同共用可回滚状态，不独立提交。 */
export function createRentalBillingFakes(state: RentalTestState) {
  const fail = (operation: string) => {
    if (state.failNextRepositoryOperation === operation) {
      state.failNextRepositoryOperation = null;
      state.failNextRepositoryOperationPhase = null;
      throw new Error(`Rental billing failure: ${operation}`);
    }
  };
  const billsRepository: Partial<BillsRepository> = {
    findGeneration: async (org, key) =>
      state.billGenerations.find(
        (item) => item.organizationId === org && item.idempotencyKey === key,
      ) ?? null,
    createGeneration: async (input) => {
      const record = {
        ...input,
        id: randomUUID(),
        createdAt: new Date(),
      } as (typeof state.billGenerations)[number];
      state.billGenerations.push(record);
      fail("billing.generation");
      return record;
    },
    insertBills: async (context, source, generationId, drafts) => {
      state.billCounter += drafts.length;
      const records = drafts.map((draft, index) => ({
        ...rentalBillingDetail(source, draft),
        organizationId: context.organizationId,
        billNumber: `RB-2026-${state.billCounter - drafts.length + index + 1}`,
        generationId,
        adjustmentId: draft.adjustmentId,
        snapshot: {
          propertyId: source.contract.propertyId,
          propertyName: source.contract.propertyName,
          contractNumber: source.contract.contractNumber,
          spaces: structuredClone(source.contract.spaces),
          parties: source.contract.parties.map(({ tenantId, name, isPrimaryPayer }) => ({
            tenantId,
            name,
            isPrimaryPayer,
          })),
        },
      }));
      state.bills.push(...records);
      fail("billing.lines");
      return [];
    },
    voidBills: async (context, ids, reason) => {
      for (const bill of state.bills)
        if (
          bill.organizationId === context.organizationId &&
          ids.includes(bill.id) &&
          bill.status === "active"
        ) {
          bill.status = "voided";
          bill.voidReason = reason;
          bill.voidedAt = new Date().toISOString();
          bill.voidedBy = context.userId;
        }
      fail("billing.void");
    },
    activeForContract: async (org, id) =>
      structuredClone(
        state.bills.filter(
          (bill) =>
            bill.organizationId === org && bill.contractId === id && bill.status === "active",
        ),
      ),
    hasHistory: async (org, id) =>
      state.bills.some((bill) => bill.organizationId === org && bill.contractId === id),
    list: async (org, query) => {
      const all = state.bills.filter(
        (bill) =>
          bill.organizationId === org &&
          (!query.contractId || bill.contractId === query.contractId) &&
          (!query.propertyId || bill.propertyId === query.propertyId) &&
          bill.status === (query.status ?? "active") &&
          (!query.type || bill.type === query.type) &&
          (!query.keyword ||
            `${bill.billNumber} ${bill.contractNumber} ${bill.propertyName}`.includes(
              query.keyword,
            )) &&
          (!query.dueDateFrom || bill.dueDate >= query.dueDateFrom) &&
          (!query.dueDateTo || bill.dueDate <= query.dueDateTo),
      );
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      return {
        items: structuredClone(all.slice((page - 1) * pageSize, page * pageSize)),
        total: all.length,
        page,
        pageSize,
        totals: billingTotals(all.filter((bill) => bill.status === "active")),
        coverage: null,
      };
    },
    detail: async (org, id) => {
      const bill = state.bills.find((item) => item.organizationId === org && item.id === id);
      if (!bill) return null;
      const adjustment = state.billAdjustments.find((item) => item.id === bill.adjustmentId);
      return {
        ...structuredClone(bill),
        adjustment: adjustment
          ? {
              ...adjustment,
              terminationRecordedAt: adjustment.terminationRecordedAt.toISOString(),
              createdAt: adjustment.createdAt.toISOString(),
              revokedAt: adjustment.revokedAt?.toISOString() ?? null,
            }
          : null,
        history: structuredClone(
          state.bills
            .filter(
              (item) =>
                item.organizationId === org &&
                item.contractId === bill.contractId &&
                item.sourceKey === bill.sourceKey &&
                item.id !== id,
            )
            .slice(0, 20),
        ),
      } satisfies RentalBillDetail;
    },
  };
  const billAdjustmentsRepository: Partial<BillAdjustmentsRepository> = {
    findCurrent: async (org, id) =>
      state.billAdjustments.find(
        (item) => item.organizationId === org && item.contractId === id && !item.revokedAt,
      ) ?? null,
    insert: async (input) => {
      const record = {
        ...input,
        id: randomUUID(),
        createdAt: new Date(),
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      } as (typeof state.billAdjustments)[number];
      state.billAdjustments.push(record);
      fail("billing.adjustment");
      return record;
    },
    revoke: async (context, id, adjustmentId, reason) => {
      const current = state.billAdjustments.find(
        (item) =>
          item.organizationId === context.organizationId &&
          item.contractId === id &&
          item.id === adjustmentId &&
          !item.revokedAt,
      );
      if (!current) throw new Error("adjustment fixture unavailable");
      current.revokedAt = new Date();
      current.revokedByUserId = context.userId;
      current.revokeReason = reason;
    },
  };
  return { billsRepository, billAdjustmentsRepository };
}
