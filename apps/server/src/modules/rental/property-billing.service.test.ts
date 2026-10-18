import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { rentalPropertyBillingPermissions } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { DB } from "../../db/db.tokens.js";
import { AccessService } from "../iam/access.service.js";
import { PropertyBillingRepository } from "./property-billing.repository.js";
import { PropertyBillingService } from "./property-billing.service.js";

const auth = {
  organizationId: "org",
  userId: "user",
  sessionId: "session",
  isSuperAdmin: false,
  permissions: [...rentalPropertyBillingPermissions],
};
async function setup() {
  const repo = {
    readContext: vi
      .fn()
      .mockResolvedValue({ property: { id: "property", name: "房产" }, timezone: "Asia/Shanghai" }),
    scanSources: vi.fn().mockResolvedValue({ sources: [], nextAfterContractId: "next" }),
  };
  const db = { transaction: async (fn: (tx: unknown) => unknown) => fn({}) };
  const module = await Test.createTestingModule({
    providers: [
      PropertyBillingService,
      { provide: PropertyBillingRepository, useValue: repo },
      { provide: DB, useValue: db },
      {
        provide: AccessService,
        useValue: {
          assertPermission: (a: typeof auth, key: string) => {
            if (!a.permissions.includes(key as never)) throw new ForbiddenException();
          },
        },
      },
    ],
  }).compile();
  return { service: module.get(PropertyBillingService), repo };
}
describe("房产出账分页服务", () => {
  it.each(rentalPropertyBillingPermissions)("缺少 %s 拒绝", async (key) => {
    const { service, repo } = await setup();
    await expect(
      service.list(
        { ...auth, permissions: auth.permissions.filter((p) => p !== key) },
        { propertyId: "property", pageSize: 100 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.scanSources).not.toHaveBeenCalled();
  });
  it("空候选保留扫描游标", async () => {
    const { service } = await setup();
    expect(await service.list(auth, { propertyId: "property", pageSize: 100 })).toMatchObject({
      items: [],
      nextAfterContractId: "next",
      timezone: "Asia/Shanghai",
    });
  });
  it("其他组织或不存在的房产404", async () => {
    const { service, repo } = await setup();
    repo.readContext.mockResolvedValue(null);
    await expect(service.list(auth, { propertyId: "other", pageSize: 100 })).rejects.toMatchObject({
      status: 404,
    });
  });
  it("读取错误不伪装为空", async () => {
    const { service, repo } = await setup();
    repo.scanSources.mockRejectedValue(new Error("read failed"));
    await expect(service.list(auth, { propertyId: "property", pageSize: 100 })).rejects.toThrow(
      "read failed",
    );
  });
});
