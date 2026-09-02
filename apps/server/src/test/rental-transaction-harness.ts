import type { AppDbTransaction } from "../db/db.module.js";
import type { BookkeepingTestState } from "./bookkeeping-test-state.js";
import { createRentalDatabaseFake, type RentalQueryFixtureRegistry } from "./rental-fake-query.js";
import {
  cloneAuditEntry,
  cloneRentalTestState,
  type RentalTestState,
  restoreRentalTestState,
} from "./rental-test-state.js";

export function createRentalTransactionService(
  rental: RentalTestState,
  bookkeeping: BookkeepingTestState,
  auditLogs: unknown[],
  queryFixtures: RentalQueryFixtureRegistry,
  cloneBookkeeping: (state: BookkeepingTestState) => BookkeepingTestState,
  restoreBookkeeping: (state: BookkeepingTestState, snapshot: BookkeepingTestState) => void,
): { run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> } {
  return {
    async run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> {
      const rentalSnapshot = cloneRentalTestState(rental);
      const bookkeepingSnapshot = cloneBookkeeping(bookkeeping);
      const auditLength = auditLogs.length;
      const rentalAuditSnapshot = rental.auditEntries.map(cloneAuditEntry);
      try {
        return await operation(
          createRentalDatabaseFake(rental, queryFixtures) as unknown as AppDbTransaction,
        );
      } catch (error) {
        restoreRentalTestState(rental, rentalSnapshot);
        restoreBookkeeping(bookkeeping, bookkeepingSnapshot);
        auditLogs.splice(auditLength);
        rental.auditEntries.splice(
          0,
          rental.auditEntries.length,
          ...rentalAuditSnapshot.map(cloneAuditEntry),
        );
        throw error;
      }
    },
  };
}
