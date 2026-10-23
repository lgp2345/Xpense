import { describe, expect, it } from "vitest";
import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { OrganizationManagementRepository } from "./organization-management.repository.js";

describe("OrganizationManagementRepository", () => {
  it("derives a username from phone when inserting a new owner", async () => {
    const insertedValues: unknown[] = [];
    const tx = {
      insert: () => ({
        values: (values: unknown) => ({
          returning: async () => {
            insertedValues.push(values);
            return [{ id: "new-owner" }];
          },
        }),
      }),
    } as unknown as AppDbExecutor;
    const repository = new OrganizationManagementRepository({} as AppDb);

    await expect(
      repository.insertUser(
        {
          phone: "13800000001",
          email: null,
          passwordHash: "unused-test-hash",
        },
        tx,
      ),
    ).resolves.toBe("new-owner");

    expect(insertedValues).toEqual([
      {
        phone: "13800000001",
        username: "13800000001",
        email: null,
        passwordHash: "unused-test-hash",
        initialPasswordUnchanged: true,
      },
    ]);
  });
});
