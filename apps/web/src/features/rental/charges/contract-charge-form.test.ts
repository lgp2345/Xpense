import { describe, expect, it } from "vitest";
import {
  contractChargeFormSchema,
  defaultContractChargeValues,
  toContractChargeSetup,
} from "./contract-charge-form";

describe("合同收费请求转换", () => {
  it("空底数不变成零，不代收时不验证隐藏字段", () => {
    const value = {
      ...defaultContractChargeValues(),
      waterUnitPrice: "3",
      electricityCollectionEnabled: false,
      electricityUnitPrice: "无效",
    };
    expect(toContractChargeSetup(value)).toEqual({
      chargeTerms: {
        waterCollectionEnabled: true,
        electricityCollectionEnabled: false,
        waterUnitPrice: "3",
        electricityUnitPrice: "0.0000",
        fixedFees: [],
      },
      baselineReadings: [],
    });
  });
  it("真实零底数和日期成对转换，固定费金额精确且名称去空白", () => {
    const value = {
      ...defaultContractChargeValues(),
      waterUnitPrice: "0",
      electricityCollectionEnabled: false,
      waterReading: "0",
      waterReadingDate: "2026-10-02",
      fixedFees: [
        { id: "123e4567-e89b-42d3-a456-426614174000", name: " 管理费 ", amount: "50.01" },
      ],
    };
    expect(toContractChargeSetup(value)).toMatchObject({
      chargeTerms: { fixedFees: [{ name: "管理费", monthlyAmountMinor: 5001 }] },
      baselineReadings: [{ kind: "water", reading: "0", readingDate: "2026-10-02" }],
    });
    expect(contractChargeFormSchema.safeParse({ ...value, waterReadingDate: "" }).success).toBe(
      false,
    );
    expect(
      contractChargeFormSchema.safeParse({ ...value, waterReadingDate: "2026-02-29" }).success,
    ).toBe(false);
  });
  it("代收单价不能为空，费用不允许负数、溢出、重复ID", () => {
    expect(contractChargeFormSchema.safeParse(defaultContractChargeValues()).success).toBe(false);
    const value = {
      ...defaultContractChargeValues(),
      waterCollectionEnabled: false,
      electricityCollectionEnabled: false,
    };
    for (const amount of ["-1", "90071992547409.92", "1.001", ""])
      expect(
        contractChargeFormSchema.safeParse({
          ...value,
          fixedFees: [{ id: "123e4567-e89b-42d3-a456-426614174000", name: "网费", amount }],
        }).success,
      ).toBe(false);
    const fee = { id: "123e4567-e89b-42d3-a456-426614174000", name: "管理费", amount: "50" };
    expect(contractChargeFormSchema.safeParse({ ...value, fixedFees: [fee, fee] }).success).toBe(
      false,
    );
  });
});
