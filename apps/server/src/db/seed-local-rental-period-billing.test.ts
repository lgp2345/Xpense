import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queries: [] as string[],
  select: vi.fn(),
  create: vi.fn(),
  end: vi.fn(),
}));
vi.mock("@nestjs/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nestjs/core")>()),
  NestFactory: { createApplicationContext: mocks.create },
}));
vi.mock("postgres", () => ({
  default: () => {
    const client = Object.assign(
      async (strings: TemplateStringsArray) => {
        mocks.queries.push(strings.join("?"));
        return [{ column_name: "period_start" }];
      },
      { end: mocks.end },
    );
    return client;
  },
}));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: () => ({ select: mocks.select }) }));

import {
  parsePeriodSeedArgs,
  periodSeedScenarios,
  seedLocalRentalPeriodBilling,
} from "./seed-local-rental-period-billing.js";
import { periodSeedStepKey } from "./seed-local-rental-period-finance.js";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
});
it("默认演练且必须复用指定组织和已有用户", () => {
  expect(parsePeriodSeedArgs(["--organization-id", id, "--actor-user-id", id])).toEqual({
    organizationId: id,
    actorUserId: id,
    apply: false,
  });
  expect(() => parsePeriodSeedArgs([])).toThrow();
  expect(() => parsePeriodSeedArgs(["--password", "synthetic"])).toThrow();
});
it("相对组织日期安排两种锚点、季度、接续、作废与尾期场景", () => {
  const scenarios = periodSeedScenarios("2026-10-08");
  expect(scenarios).toHaveLength(5);
  expect(scenarios.find((s) => s.key === "calendar-quarter")).toMatchObject({
    anchor: "calendar_month",
    months: 3,
  });
  expect(scenarios.find((s) => s.key === "monthly-start")).toMatchObject({
    anchor: "contract_start",
    months: 1,
  });
  expect(scenarios.find((s) => s.key === "settlement-ready")?.end).toBe("2026-10-07");
  expect(scenarios.find((s) => s.key === "continuation")?.start).toBe("2025-10-01");
});
it("稳定步骤标识重复运行不改变，合同和步骤隔离", () => {
  expect(periodSeedStepKey(id, "first")).toMatch(/^[a-f0-9-]{36}$/);
  expect(periodSeedStepKey(id, "first")).toBe(periodSeedStepKey(id, "first"));
  expect(periodSeedStepKey(id, "first")).not.toBe(periodSeedStepKey(id, "second"));
});
it("演练查询范围和schema，不引导应用或执行财务写入", async () => {
  const where = vi
    .fn()
    .mockResolvedValueOnce([{ id, timezone: "Asia/Shanghai" }])
    .mockResolvedValueOnce([{ roleId: id, status: "active" }])
    .mockResolvedValueOnce([]);
  mocks.select.mockReturnValue({ from: () => ({ where, innerJoin: () => ({ where }) }) });
  const result = await seedLocalRentalPeriodBilling("postgres://localhost/dev", {
    organizationId: id,
    actorUserId: id,
    apply: false,
  });
  expect(result.mode).toBe("dry-run");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.queries.every((query) => query.startsWith("SELECT"))).toBe(true);
  expect(mocks.end).toHaveBeenCalledOnce();
});
it("远程目标立即拒绝，错误不泄露连接信息", async () => {
  await expect(
    seedLocalRentalPeriodBilling("postgres://synthetic:placeholder@remote.invalid/db", {
      organizationId: id,
      actorUserId: id,
      apply: true,
    }),
  ).rejects.toThrow("目标不是受支持的本地开发数据库");
  expect(mocks.select).not.toHaveBeenCalled();
});
