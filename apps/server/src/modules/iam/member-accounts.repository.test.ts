import { ConflictException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { users } from "../../db/schema.js";
import { MemberAccountsRepository } from "./member-accounts.repository.js";

describe("MemberAccountsRepository", () => {
  it("用完整手机号查找并锁定账号，返回不含凭据的资料", async () => {
    const record = { id: "user-1", username: "原用户", status: "active" };
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([record]),
    };
    const select = vi.fn().mockReturnValue(query);
    const repository = new MemberAccountsRepository({ select } as never);
    expect(await repository.findByPhone("13800000009")).toEqual(record);
    const compiled = new PgDialect().sqlToQuery(query.where.mock.calls[0]?.[0]);
    expect(compiled.sql).toBe('"users"."phone" = $1');
    expect(compiled.params).toEqual(["13800000009"]);
    expect(select).toHaveBeenCalledWith({
      id: users.id,
      username: users.username,
      status: users.status,
    });
    expect(query.for).toHaveBeenCalledWith("no key update");
  });
  it("并发注册冲突时返回业务冲突，避免覆盖已有账号", async () => {
    const query = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    const repository = new MemberAccountsRepository({} as never);
    await expect(
      repository.create({ phone: "13800000009", username: "用户", passwordHash: "test-hash" }, {
        insert: () => query,
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query.onConflictDoNothing).toHaveBeenCalledWith({ target: users.phone });
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({ username: "用户", initialPasswordUnchanged: true }),
    );
  });
});
