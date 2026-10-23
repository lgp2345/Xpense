import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { PasswordService } from "../auth/password.service.js";
import { MemberAccountsRepository } from "./member-accounts.repository.js";
import { MemberAccountsService } from "./member-accounts.service.js";

async function harness(existing: { id: string; username: string; status: string } | null = null) {
  const stored: Record<string, unknown>[] = [];
  const repository = {
    findByPhone: vi.fn().mockResolvedValue(existing),
    create: async (input: Record<string, unknown>) => {
      stored.push(input);
      return "created-user";
    },
  };
  const module = await Test.createTestingModule({
    providers: [
      MemberAccountsService,
      { provide: MemberAccountsRepository, useValue: repository },
      { provide: PasswordService, useValue: { hash: async () => "hashed-initial-password" } },
    ],
  }).compile();
  return { service: module.get(MemberAccountsService), stored };
}

describe("MemberAccountsService", () => {
  it("创建未注册手机号的账号并只保存密码散列", async () => {
    const { service, stored } = await harness();
    expect(await service.resolve("13800000009", "同名用户", {} as never)).toBe("created-user");
    expect(stored).toEqual([
      { phone: "13800000009", username: "同名用户", passwordHash: "hashed-initial-password" },
    ]);
  });
  it("关联已有账号且不更新其用户名", async () => {
    const { service, stored } = await harness({
      id: "existing",
      username: "原用户名",
      status: "active",
    });
    expect(await service.resolve("13800000009", "不同用户名", {} as never)).toBe("existing");
    expect(stored).toEqual([]);
    expect(await service.findCandidate("13800000009")).toEqual({
      username: "原用户名",
      status: "active",
    });
  });
  it("拒绝关联已禁用的账号", async () => {
    const { service, stored } = await harness({
      id: "disabled",
      username: "原用户名",
      status: "disabled",
    });
    await expect(service.resolve("13800000009", "原用户名", {} as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(stored).toEqual([]);
  });
});
