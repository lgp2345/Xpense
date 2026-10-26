import type { AppDbTransaction } from "../db/db.module.js";
import { createRentalDatabaseFake, type RentalQueryFixtureRegistry } from "./rental-fake-query.js";
import {
  cloneAuditEntry,
  cloneRentalTestState,
  type RentalTestState,
  restoreRentalTestState,
} from "./rental-test-state.js";

export function createRentalTransactionService(
  rental: RentalTestState,
  auditLogs: unknown[],
  queryFixtures: RentalQueryFixtureRegistry,
): { run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> } {
  return {
    async run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> {
      const rentalSnapshot = cloneRentalTestState(rental);
      const auditLength = auditLogs.length;
      const rentalAuditSnapshot = rental.auditEntries.map(cloneAuditEntry);
      try {
        return await operation(
          createRentalDatabaseFake(rental, queryFixtures) as unknown as AppDbTransaction,
        );
      } catch (error) {
        restoreRentalTestState(rental, rentalSnapshot);
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
