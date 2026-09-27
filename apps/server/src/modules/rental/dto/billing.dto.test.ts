import { describe, expect, it } from "vitest";

import { billDetailSchema } from "./bill-detail.dto.js";
import { generateBillsSchema } from "./generate-bills.dto.js";
import { listBillsSchema } from "./list-bills.dto.js";
import { previewBillsSchema } from "./preview-bills.dto.js";
import { previewTerminationSchema } from "./preview-termination.dto.js";
import { terminateContractSchema } from "./terminate-contract.dto.js";

const id = "00000000-0000-4000-8000-000000000001";
const valid = {
  contractId: id,
  depositDueDates: {},
  expectedVersion: "version",
  idempotencyKey: id,
};

describe("账单输入边界", () => {
  it("允许缺日期的只读预览，不允许生成提交租金或分页", () => {
    expect(previewBillsSchema.parse({ contractId: id }).depositDueDates).toEqual({});
    expect(generateBillsSchema.safeParse(valid).success).toBe(true);
    for (const extra of [{ rentAmountMinor: 1 }, { page: 1 }, { pageSize: 20 }]) {
      expect(generateBillsSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    expect(generateBillsSchema.safeParse({ contractId: id, depositDueDates: {} }).success).toBe(
      false,
    );
  });

  it("押金日期、终止日期及 UUID 严格校验", () => {
    for (const date of ["2026-02-29", "2026-04-31", "0000-01-01", "2026-9-01"]) {
      expect(
        previewBillsSchema.safeParse({ contractId: id, depositDueDates: { deposit: date } })
          .success,
      ).toBe(false);
      expect(
        previewTerminationSchema.safeParse({ contractId: id, terminationDate: date }).success,
      ).toBe(false);
    }
    expect(billDetailSchema.safeParse({ id: "other" }).success).toBe(false);
    expect(billDetailSchema.safeParse({ id, amount: 1 }).success).toBe(false);
    expect(
      previewTerminationSchema.parse({ contractId: id, terminationDate: "2028-02-29" })
        .terminationDate,
    ).toBe("2028-02-29");
  });

  it("分页有界、日期筛选有序、状态不会暗示收款", () => {
    expect(listBillsSchema.parse({})).toMatchObject({ page: 1, pageSize: 20, status: "active" });
    expect(listBillsSchema.parse({ page: "2", pageSize: "100" })).toMatchObject({
      page: 2,
      pageSize: 100,
    });
    for (const value of [
      { pageSize: 101 },
      { page: 0 },
      { status: "paid" },
      { dueDateFrom: "2026-10-01", dueDateTo: "2026-09-01" },
    ]) {
      expect(listBillsSchema.safeParse(value).success).toBe(false);
    }
    expect(previewBillsSchema.safeParse({ contractId: id, page: 2 }).success).toBe(false);
    expect(
      previewBillsSchema.safeParse({ contractId: id, page: 2, expectedVersion: "version" }).success,
    ).toBe(true);
  });

  it("终止整期金额允许零，拒绝非安全整数、负数和空原因", () => {
    const base = { id, terminationDate: "2026-09-27", reason: "终止" };
    const confirmation = { expectedVersion: "version", finalAmountMinor: 0, reason: "  协商  " };
    expect(terminateContractSchema.parse(base)).toEqual(base);
    expect(
      terminateContractSchema.parse({ ...base, billingConfirmation: confirmation })
        .billingConfirmation,
    ).toEqual({ ...confirmation, reason: "协商" });
    for (const amount of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      const input = { ...confirmation, finalAmountMinor: amount };
      expect(
        terminateContractSchema.safeParse({ ...base, billingConfirmation: input }).success,
      ).toBe(false);
      expect(
        generateBillsSchema.safeParse({
          ...valid,
          terminationConfirmation: { finalAmountMinor: amount, reason: "协商" },
        }).success,
      ).toBe(false);
    }
    for (const reason of ["  ", "x".repeat(1001)]) {
      expect(
        terminateContractSchema.safeParse({
          ...base,
          billingConfirmation: { ...confirmation, reason },
        }).success,
      ).toBe(false);
    }
  });
});
