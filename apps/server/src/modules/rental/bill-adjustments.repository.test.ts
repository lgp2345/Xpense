import { Test } from "@nestjs/testing";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { DB } from "../../db/db.tokens.js";
import { BillAdjustmentsRepository } from "./bill-adjustments.repository.js";

describe("终止财务记录", () => {
  it("只读当前组织合同未撤销的事件", async () => {
    const module = await Test.createTestingModule({
      providers: [BillAdjustmentsRepository, { provide: DB, useValue: {} }],
    }).compile();
    const where = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) });
    const executor = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }),
    };
    expect(
      await module.get(BillAdjustmentsRepository).findCurrent("org", "contract", executor as never),
    ).toBeNull();
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.params).toEqual(["org", "contract"]);
    expect(query.sql).toContain('"revoked_at" is null');
    await module.close();
  });
});
