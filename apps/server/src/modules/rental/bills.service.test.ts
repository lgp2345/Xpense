import { randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { GenerateRentalBillsRequest, RentalBillDetail } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { BillingSource, PersistableBillingDraft } from "./billing.types.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillingTerminationService } from "./billing-termination.service.js";
import { BillsRepository } from "./bills.repository.js";
import type { GenerationRecord, NewGeneration } from "./bills.repository.types.js";
import { BillsService } from "./bills.service.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { previewBillsSchema } from "./dto/preview-bills.dto.js";

const auth = {
  organizationId: "org",
  userId: "user",
  sessionId: "session",
  isSuperAdmin: false,
  permissions: ["rental_contracts:read", "rental_bills:read", "rental_bills:generate"] as const,
};
const authorized = () => ({ ...auth, permissions: [...auth.permissions] });

async function harness(source = rentalBillingSource()) {
  const state = {
    bills: [] as RentalBillDetail[],
    generations: [] as GenerationRecord[],
    audits: [] as unknown[],
  };
  let tail = Promise.resolve();
  const transaction = {};
  const run = async (operation: (tx: never) => Promise<unknown>) => {
    const previous = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone(state);
    try {
      return await operation(transaction as never);
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    } finally {
      release();
    }
  };
  const repository = {
    findGeneration: async (_org: string, key: string) =>
      state.generations.find((item) => item.idempotencyKey === key) ?? null,
    createGeneration: async (input: NewGeneration) => {
      const record = { ...input, id: randomUUID(), createdAt: new Date() } as GenerationRecord;
      state.generations.push(record);
      return record;
    },
    insertBills: vi.fn(
      async (
        _context: unknown,
        current: BillingSource,
        generationId: string,
        drafts: PersistableBillingDraft[],
      ) => {
        state.bills.push(
          ...drafts.map((draft, index) => ({
            id: randomUUID(),
            billNumber: `RB-${index}`,
            contractId: current.contract.id,
            contractNumber: current.contract.contractNumber,
            propertyId: current.contract.propertyId,
            propertyName: current.contract.propertyName,
            currencyCode: "CNY",
            type: draft.type,
            status: "active" as const,
            sourceKey: draft.sourceKey,
            periodStart: draft.periodStart,
            periodEnd: draft.periodEnd,
            effectiveEnd: draft.effectiveEnd,
            dueDate: draft.dueDate,
            amountMinor: draft.amountMinor,
            dueState: null,
            createdAt: new Date().toISOString(),
            lines: draft.lines,
            generationId,
            adjustmentId: null,
            adjustment: null,
            snapshot: {
              propertyId: current.contract.propertyId,
              propertyName: current.contract.propertyName,
              contractNumber: current.contract.contractNumber,
              spaces: current.contract.spaces,
              parties: [],
            },
            voidReason: null,
            voidedAt: null,
            voidedBy: null,
            history: [],
          })),
        );
        return [];
      },
    ),
  };
  const read = async (organizationId: string, contractId: string) => {
    if (organizationId !== source.organizationId || contractId !== source.contract.id)
      throw new NotFoundException();
    return {
      ...structuredClone(source),
      activeBills: structuredClone(state.bills.filter((bill) => bill.status === "active")),
    };
  };
  const audit = {
    appendRequired: vi.fn(async (entry: unknown) => {
      state.audits.push(entry);
    }),
  };
  const module = await Test.createTestingModule({
    providers: [
      BillsService,
      {
        provide: BillingTerminationService,
        useValue: { confirm: vi.fn().mockResolvedValue({ id: randomUUID() }) },
      },
      { provide: BillsRepository, useValue: repository },
      { provide: BillingSourceService, useValue: { read } },
      {
        provide: ContractsRepository,
        useValue: {
          find: async () => ({ propertyId: source.contract.propertyId }),
          findForUpdate: async () => ({ propertyId: source.contract.propertyId }),
        },
      },
      {
        provide: ContractsPolicyService,
        useValue: {
          lockOrganizationContext: async () => ({ timezone: source.timezone, today: source.today }),
          requireOwnedPropertyForUpdate: async () => ({ isActive: false }),
          requireContract: (value: unknown) => {
            if (!value) throw new NotFoundException();
            return value;
          },
        },
      },
      { provide: DatabaseTransactionService, useValue: { run } },
      { provide: AuditService, useValue: audit },
      {
        provide: AccessService,
        useValue: {
          assertPermission: (context: ReturnType<typeof authorized>, permission: never) => {
            if (!context.permissions.includes(permission)) throw new ForbiddenException();
          },
        },
      },
    ],
  }).compile();
  const service = module.get(BillsService);
  const input = { contractId: source.contract.id, depositDueDates: {} as Record<string, string> };
  const preview = () => service.preview(authorized(), previewBillsSchema.parse(input));
  const ready = async () => {
    const blank = await preview();
    for (const key of blank.missingDepositSourceKeys) input.depositDueDates[key] = "2026-01-01";
    const value = await preview();
    return {
      ...input,
      depositDueDates: { ...input.depositDueDates },
      expectedVersion: value.version,
      idempotencyKey: randomUUID(),
    } satisfies GenerateRentalBillsRequest;
  };
  return { module, state, source, service, input, preview, ready, repository, audit };
}

describe("全租期预览与幂等写入", () => {
  it("历史终止首次生成仅适用原账期，确认零额和原因，完整批次关联新调整事件", async () => {
    const source = rentalBillingSource({
      lifecycleStatus: "terminated",
      terminationDate: "2026-06-30",
      depositTerms: [],
    });
    source.terminationRecordedAt = "2026-05-01T00:00:00.000Z";
    const h = await harness(source);
    const blank = await h.preview();
    expect(blank).toMatchObject({
      canGenerate: false,
      createCount: 2,
      terminationReference: { originalAmountMinor: 900000, referenceAmountMinor: 900000 },
    });
    const context = {
      ...authorized(),
      permissions: [...auth.permissions, "rental_bills:adjust"] as AuthContext["permissions"],
    };
    const input = {
      ...h.input,
      terminationConfirmation: { finalAmountMinor: 0, reason: "免除当期" },
    };
    const preview = await h.service.preview(context, previewBillsSchema.parse(input));
    expect(preview.canGenerate).toBe(true);
    const result = await h.service.generate(context, {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(result.createdCount).toBe(2);
    expect(h.state.bills.at(-1)?.lines.at(-1)).toMatchObject({
      kind: "termination_adjustment",
      amountMinor: -900000,
    });
    await h.module.close();
  });

  it("首次四张租金加两张押金，重放不重复且不分配新批次", async () => {
    const h = await harness();
    expect((await h.preview()).canGenerate).toBe(false);
    const request = await h.ready();
    const result = await h.service.generate(authorized(), request);
    expect(result.createdCount).toBe(6);
    expect(result.totals).toEqual({ rentAmountMinor: 3600000, depositAmountMinor: 310000 });
    const replayed = await h.service.generate(authorized(), request);
    expect(replayed.generationId).toBe(result.generationId);
    expect(replayed.replayed).toBe(true);
    expect(h.state.bills).toHaveLength(6);
    expect(h.state.generations).toHaveLength(1);
    for (const bill of h.state.bills) bill.status = "voided";
    h.source.contract.rentAmountMinor = 400000;
    expect((await h.service.generate(authorized(), request)).replayed).toBe(true);
    expect(h.state.bills).toHaveLength(6);
    await h.module.close();
  });
  it("旧版本和同键异内容拒绝，不静默跳过金额不一致的有效账单", async () => {
    const h = await harness();
    const request = await h.ready();
    h.source.contract.rentAmountMinor = 400000;
    await expect(h.service.generate(authorized(), request)).rejects.toMatchObject({ status: 409 });
    h.source.contract.rentAmountMinor = 300000;
    await h.service.generate(authorized(), request);
    await expect(
      h.service.generate(authorized(), { ...request, contractId: "another-contract" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      h.service.generate(authorized(), { ...request, depositDueDates: {} }),
    ).rejects.toMatchObject({ status: 409 });
    h.input.depositDueDates = {};
    const firstBill = h.state.bills[0];
    if (firstBill) firstBill.amountMinor = 1;
    await expect(h.preview()).rejects.toMatchObject({ status: 409 });
    await h.module.close();
  });
  it("无新增明确返回，拒绝未知押金键和修改既有日期", async () => {
    const h = await harness();
    const request = await h.ready();
    await h.service.generate(authorized(), request);
    await expect(h.preview()).rejects.toMatchObject({ status: 400 });
    h.input.depositDueDates = {};
    const preview = await h.preview();
    expect(preview.createCount).toBe(0);
    expect(preview.existingCount).toBe(6);
    expect(
      await h.service.generate(authorized(), {
        ...h.input,
        expectedVersion: preview.version,
        idempotencyKey: randomUUID(),
      }),
    ).toMatchObject({ createdCount: 0, existingCount: 6, generationId: null });
    await expect(
      h.service.preview(
        authorized(),
        previewBillsSchema.parse({ ...h.input, depositDueDates: { unknown: "2026-01-01" } }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await h.module.close();
  });
  it("第一页最多 100 张，确认仍生成 101 张并拒绝页间版本变化", async () => {
    const h = await harness(
      rentalBillingSource({
        startDate: "2026-01-01",
        endDate: "2034-05-31",
        paymentIntervalMonths: 1,
        depositTerms: [],
      }),
    );
    const first = await h.service.preview(
      authorized(),
      previewBillsSchema.parse({ ...h.input, pageSize: 100 }),
    );
    expect(first.items).toHaveLength(100);
    expect(first.createCount).toBe(101);
    expect(
      (
        await h.service.generate(authorized(), {
          ...h.input,
          expectedVersion: first.version,
          idempotencyKey: randomUUID(),
        })
      ).createdCount,
    ).toBe(101);
    await expect(
      h.service.preview(
        authorized(),
        previewBillsSchema.parse({ ...h.input, page: 2, expectedVersion: first.version }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await h.module.close();
  });
  it("审计或明细失败整批回滚，两个相同请求串行重放", async () => {
    const h = await harness();
    const request = await h.ready();
    h.audit.appendRequired.mockRejectedValueOnce(new Error("audit failure"));
    await expect(h.service.generate(authorized(), request)).rejects.toThrow("audit failure");
    expect(h.state.bills).toHaveLength(0);
    expect(h.state.generations).toHaveLength(0);
    const insert = h.repository.insertBills.getMockImplementation();
    h.repository.insertBills.mockImplementationOnce(async (...args) => {
      await insert?.(...args);
      throw new Error("line failure");
    });
    await expect(h.service.generate(authorized(), request)).rejects.toThrow("line failure");
    expect(h.state.bills).toHaveLength(0);
    expect(h.state.generations).toHaveLength(0);
    const results = await Promise.all([
      h.service.generate(authorized(), request),
      h.service.generate(authorized(), request),
    ]);
    expect(results[0]?.generationId).toBe(results[1]?.generationId);
    expect(h.state.bills).toHaveLength(6);
    await h.module.close();
  });
  it("草稿、取消、跨组织和无权限拒绝；历史停用房产仍能生成", async () => {
    const h = await harness();
    for (const lifecycleStatus of ["draft", "cancelled"] as const) {
      h.source.contract.lifecycleStatus = lifecycleStatus;
      await expect(h.preview()).rejects.toMatchObject({ status: 409 });
    }
    h.source.contract.lifecycleStatus = "confirmed";
    await expect(
      h.service.preview(
        { ...authorized(), organizationId: "other" },
        previewBillsSchema.parse(h.input),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      h.service.preview({ ...authorized(), permissions: [] }, previewBillsSchema.parse(h.input)),
    ).rejects.toMatchObject({ status: 403 });
    expect((await h.service.generate(authorized(), await h.ready())).createdCount).toBe(6);
    await h.module.close();
  });
});
