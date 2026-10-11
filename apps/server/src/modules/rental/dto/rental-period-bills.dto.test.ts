import { expect, it } from "vitest";
import {
  generateRentalPeriodBillSchema,
  periodBillContextSchema,
  previewRentalPeriodBillSchema,
  voidRentalPeriodBillSchema,
} from "./rental-period-bills.dto.js";

const id = "00000000-0000-4000-8000-000000000001";
it("context默认分页20且上限100", () => {
  expect(periodBillContextSchema.parse({ contractId: id })).toEqual({
    contractId: id,
    page: 1,
    pageSize: 20,
  });
  expect(periodBillContextSchema.safeParse({ contractId: id, pageSize: 101 }).success).toBe(false);
});
it("预览不接受期末或客户端房租金额", () => {
  const dto = { contractId: id, periodStart: "2026-10-05", extraFees: [] };
  expect(previewRentalPeriodBillSchema.safeParse(dto).success).toBe(true);
  expect(previewRentalPeriodBillSchema.safeParse({ ...dto, periodEnd: "2026-11-04" }).success).toBe(
    false,
  );
  expect(previewRentalPeriodBillSchema.safeParse({ ...dto, amountMinor: 1 }).success).toBe(false);
});
it("整体备注可选、去空格并限制1000个字符", () => {
  const preview = { contractId: id, periodStart: "2026-10-05", extraFees: [] };
  expect(previewRentalPeriodBillSchema.safeParse(preview).success).toBe(true);
  expect(previewRentalPeriodBillSchema.parse({ ...preview, note: "  本期说明  " }).note).toBe(
    "本期说明",
  );
  expect(previewRentalPeriodBillSchema.parse({ ...preview, note: "   " }).note).toBeUndefined();
  expect(
    previewRentalPeriodBillSchema.safeParse({ ...preview, note: "n".repeat(1000) }).success,
  ).toBe(true);
  expect(
    previewRentalPeriodBillSchema.safeParse({ ...preview, note: "n".repeat(1001) }).success,
  ).toBe(false);

  const generate = {
    ...preview,
    dueDate: "2026-10-05",
    readings: [],
    expectedVersion: "v",
    idempotencyKey: id,
  };
  expect(generateRentalPeriodBillSchema.parse({ ...generate, note: "  生成备注  " }).note).toBe(
    "生成备注",
  );
});
it("确认必须有版本幂等和完整业务字段，禁止重复表计", () => {
  const dto = {
    contractId: id,
    periodStart: "2026-10-05",
    extraFees: [],
    dueDate: "2026-10-05",
    readings: [],
    expectedVersion: "v",
    idempotencyKey: id,
  };
  expect(generateRentalPeriodBillSchema.safeParse(dto).success).toBe(true);
  expect(
    generateRentalPeriodBillSchema.safeParse({ ...dto, expectedVersion: undefined }).success,
  ).toBe(false);
  expect(
    voidRentalPeriodBillSchema.safeParse({
      billId: id,
      reason: "",
      expectedVersion: "v",
      idempotencyKey: id,
    }).success,
  ).toBe(false);
});
