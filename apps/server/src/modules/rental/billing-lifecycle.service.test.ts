import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { rentalBillingDetail, rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { BillingSource } from "./billing.types.js";
import { BillingLifecycleService } from "./billing-lifecycle.service.js";
import { normalBillingDrafts } from "./billing-plan.rules.js";
import { BillingTerminationService } from "./billing-termination.service.js";
import { BillsRepository } from "./bills.repository.js";

const auth: AuthContext = {
  organizationId: "org",
  userId: "user",
  sessionId: "session",
  isSuperAdmin: false,
  permissions: ["rental_bills:read", "rental_bills:adjust"],
};
function withBills(source: BillingSource) {
  source.activeBills = normalBillingDrafts(source, {}).map((draft, index) => ({
    ...rentalBillingDetail(source, draft),
    dueDate:
      draft.type === "rent" ? (draft.dueDate as string) : index === 4 ? "2026-01-03" : "2026-01-04",
  }));
  return source;
}
async function harness() {
  const bills = { voidBills: vi.fn().mockResolvedValue(undefined) };
  const termination = {
    onTerminate: vi.fn(),
    previewTermination: vi.fn(),
    onRevokeTermination: vi.fn(),
  };
  const module = await Test.createTestingModule({
    providers: [
      BillingLifecycleService,
      { provide: BillsRepository, useValue: bills },
      { provide: BillingTerminationService, useValue: termination },
      { provide: AuditService, useValue: { appendRequired: vi.fn() } },
      {
        provide: AccessService,
        useValue: {
          assertPermission: (
            context: AuthContext,
            permission: AuthContext["permissions"][number],
          ) => {
            if (!context.permissions.includes(permission)) throw new ForbiddenException();
          },
        },
      },
    ],
  }).compile();
  return { service: module.get(BillingLifecycleService), bills, module };
}
describe("合同账单联动", () => {
  it("月租变化作废租金和倍数押金，固定押金保留", async () => {
    const h = await harness();
    const before = withBills(rentalBillingSource());
    const after = structuredClone(before);
    after.contract.rentAmountMinor = 400000;
    const multiple = after.contract.depositTerms[0];
    if (multiple) multiple.finalAmountMinor = 400000;
    await h.service.onCorrection(auth, before, after, {} as never);
    expect(h.bills.voidBills.mock.calls[0]?.[1]).toEqual(
      before.activeBills.slice(0, 5).map((bill) => bill.id),
    );
    await h.module.close();
  });
  it("备注、UUID 重建、重排不作废；删除重复项保留较小序号及原日期", async () => {
    const h = await harness();
    const before = rentalBillingSource();
    const fixed = before.contract.depositTerms[1];
    if (!fixed) throw new Error("fixture");
    before.contract.depositTerms = [{ ...fixed }, { ...fixed, id: randomUUID() }];
    withBills(before);
    const same = structuredClone(before);
    same.contract.note = "changed";
    same.contract.depositTerms.reverse();
    same.contract.depositTerms.forEach((term) => {
      term.id = randomUUID();
    });
    await h.service.onCorrection(auth, before, same, {} as never);
    expect(h.bills.voidBills).not.toHaveBeenCalled();
    same.contract.depositTerms.pop();
    await h.service.onCorrection(auth, before, same, {} as never);
    expect(h.bills.voidBills.mock.calls[0]?.[1]).toEqual([before.activeBills.at(-1)?.id]);
    expect(before.activeBills[4]?.dueDate).toBe("2026-01-03");
    await h.module.close();
  });
  it("取消作废全部有效应收；无调整权限在任何写入前拒绝", async () => {
    const h = await harness();
    const source = withBills(rentalBillingSource());
    await expect(
      h.service.onCancel({ ...auth, permissions: [] }, source, {} as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.bills.voidBills).not.toHaveBeenCalled();
    await h.service.onCancel(auth, source, {} as never);
    expect(h.bills.voidBills.mock.calls[0]?.[1]).toHaveLength(6);
    await h.module.close();
  });
});
