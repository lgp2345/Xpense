import { describe, expect, it } from "vitest";
import type { AppDbExecutor } from "../../db/db.module.js";
import { menus } from "../../db/schema.js";

import { initializeOrganization } from "./organization-initializer.js";

describe("initializeOrganization", () => {
  it("creates organization menus without personal bookkeeping data", async () => {
    const insertedTables: unknown[] = [];
    let nextId = 0;
    const tx = {
      select() {
        return {
          from(_table: unknown) {
            return {
              where() {
                const query = Promise.resolve([]);

                return Object.assign(query, { limit: async () => [] });
              },
            };
          },
        };
      },
      insert(table: unknown) {
        insertedTables.push(table);

        return {
          values() {
            return {
              returning: async () => [{ id: ++nextId }],
              onConflictDoNothing: () => ({ returning: async () => [{ id: ++nextId }] }),
            };
          },
        };
      },
    } as unknown as AppDbExecutor;

    await initializeOrganization(tx, "organization-1");

    expect(insertedTables).toContain(menus);
    expect(insertedTables.every((table) => table === menus)).toBe(true);
  });
});
