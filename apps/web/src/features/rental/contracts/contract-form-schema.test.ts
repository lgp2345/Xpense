import { describe, expect, it } from "vitest";
import { defaultContractChargeValues } from "../charges/contract-charge-form";

import {
  contractFormSchema,
  defaultContractFormValues,
  parseMinor,
  stepSchemas,
  toConfirmedContractRequest,
  toContractFormValues,
  toCreateContractRequest,
  toStepUpdateRequest,
} from "./contract-form-schema";

const propertyId = "123e4567-e89b-42d3-a456-426614174000";
const spaceId = "223e4567-e89b-42d3-a456-426614174000";
const tenantId = "323e4567-e89b-42d3-a456-426614174000";
const base = () => ({
  ...defaultContractFormValues(propertyId),
  spaces: [{ spaceId, rentAllocationText: "" }],
  parties: [{ tenantId, isPrimaryPayer: true }],
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  rentAmountText: "8000",
  billingAnchor: "contract_start" as const,
  paymentIntervalMonths: "1" as const,
  dueDaysBeforeText: "0",
});

describe("contract form schema", () => {
  it("提交和更新保留租期的时分秒", () => {
    const values = {
      ...base(),
      startDate: "2026-10-05T00:00:00",
      endDate: "2026-11-04T23:59:59",
    };
    expect(contractFormSchema.safeParse(values).success).toBe(true);
    expect(toConfirmedContractRequest(values)).toMatchObject({
      startDate: values.startDate,
      endDate: values.endDate,
    });
    expect(toStepUpdateRequest("contract", values, 2)).toMatchObject({
      startDate: values.startDate,
      endDate: values.endDate,
    });
  });

  it.each([
    "2026-02-29T12:00:00", "2026-10-05T24:00:00",
    "2026-10-05T12:60:00", "2026-10-05T12:00:60",
    "2026-10-05T12:00:00Z", "2026-10-05T12:00:00+08:00",
  ])("拒绝无效本地日期时间 %s", (startDate) => {
    expect(contractFormSchema.safeParse({ ...base(), startDate }).success).toBe(false);
  });

  it("同日租期按秒校验结束顺序", () => {
    const values = { ...base(), startDate: "2026-10-05T12:00:01", endDate: "2026-10-05T12:00:00" };
    expect(contractFormSchema.safeParse(values).success).toBe(false);
    expect(stepSchemas.terms.safeParse(values).success).toBe(false);
  });
  it("表单恢复服务端模式，缺失模式的历史合同按旧模式处理", () => {
    expect(defaultContractFormValues().billingMode).toBe("monthly_settlement");
    expect(toContractFormValues(baseContract()).billingMode).toBe("legacy_receivable");
    expect(
      toContractFormValues({ ...baseContract(), billingMode: "monthly_settlement" }).billingMode,
    ).toBe("monthly_settlement");
  });
  it("月度结算的空间步骤、条款和正式提交均拒绝多空间", () => {
    const values = {
      ...base(),
      spaces: [
        { spaceId, rentAllocationText: "" },
        { spaceId: propertyId, rentAllocationText: "" },
      ],
    };
    for (const schema of [contractFormSchema, stepSchemas.spaces, stepSchemas.terms]) {
      const result = schema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ["spaces"], message: "合同只能选择一个空间" }),
        );
      }
    }
    expect(() => toStepUpdateRequest("contract", values, 0)).toThrow();
    expect(() => toStepUpdateRequest("contract", values, 2)).toThrow();
    expect(() => toConfirmedContractRequest(values)).toThrow();
  });

  it("旧模式仍允许多空间，创建新合同始终按单空间校验", () => {
    const values = {
      ...base(),
      billingMode: "legacy_receivable" as const,
      spaces: [
        { spaceId, rentAllocationText: "3000" },
        { spaceId: propertyId, rentAllocationText: "5000" },
      ],
    };
    expect(contractFormSchema.safeParse(values).success).toBe(true);
    expect(toStepUpdateRequest("contract", values, 0).spaces).toHaveLength(2);
    expect(toStepUpdateRequest("contract", values, 2).spaces).toHaveLength(2);
    expect(() => toConfirmedContractRequest(values)).toThrow();
  });

  it("合同创建和条款更新一次提交收费设置，启用单价缺失阻止提交", () => {
    const chargeSetup = {
      ...defaultContractChargeValues(),
      waterUnitPrice: "3",
      electricityCollectionEnabled: false,
    };
    expect(toConfirmedContractRequest({ ...base(), chargeSetup })).toMatchObject({
      chargeSetup: {
        chargeTerms: { waterCollectionEnabled: true, electricityCollectionEnabled: false },
        baselineReadings: [],
      },
    });
    expect(toStepUpdateRequest("contract", { ...base(), chargeSetup }, 2)).toHaveProperty(
      "chargeSetup",
    );
    expect(
      contractFormSchema.safeParse({ ...base(), chargeSetup: defaultContractChargeValues() })
        .success,
    ).toBe(false);
  });

  it("serializes all local steps together, preserving exact money and deposit terms", () => {
    expect(
      toConfirmedContractRequest({
        ...base(),
        rentAmountText: "12.30",
        note: "  备注  ",
        externalContractNumber: "  EXT-1  ",
        spaces: [{ spaceId, rentAllocationText: "12.30" }],
        deposits: [
          {
            type: "rental",
            customName: "",
            calculationMode: "fixed_amount",
            fixedAmountText: "20.05",
          },
        ],
      }),
    ).toEqual({
      propertyId,
      spaces: [{ spaceId, rentAllocationMinor: 1230 }],
      parties: [{ tenantId, isPrimaryPayer: true }],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      rentAmountMinor: 1230,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      note: "备注",
      externalContractNumber: "EXT-1",
      depositTerms: [
        { type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 2005, sortOrder: 0 },
      ],
    });
    expect(() => toConfirmedContractRequest({ ...base(), rentAmountText: "0" })).toThrow();
  });

  it("defaults the expiration reminder to 30 days", () => {
    expect(defaultContractFormValues().dueDaysBeforeText).toBe("30");
  });

  it.each([
    "0",
    "0.00",
    "999999999999999999999999.99",
  ])("rejects non-positive or unsafe money %s", (value) => {
    expect(parseMinor(value)).toBeNull();
  });

  it("assembles decimal text to safe minor units without floating point drift", () => {
    expect(parseMinor("8000")).toBe(800000);
    expect(parseMinor("12.3")).toBe(1230);
    expect(parseMinor("0.01")).toBe(1);
  });

  it.each([
    "2026-02-29",
    "2026-09-31",
    "2026-9-01",
    "0000-01-01",
  ])("rejects invalid calendar date %s", (date) => {
    const result = contractFormSchema.safeParse({ ...base(), startDate: date });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.message === "请输入有效日期")).toBe(true);
  });

  it("requires at least one party and exactly one payer", () => {
    expect(contractFormSchema.safeParse({ ...base(), parties: [] }).success).toBe(false);
    expect(
      contractFormSchema.safeParse({ ...base(), parties: [{ tenantId, isPrimaryPayer: false }] })
        .success,
    ).toBe(false);
    expect(
      contractFormSchema.safeParse({
        ...base(),
        parties: [
          { tenantId, isPrimaryPayer: true },
          { tenantId: propertyId, isPrimaryPayer: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate tenant ids in both party schemas", () => {
    const parties = [
      { tenantId, isPrimaryPayer: true },
      { tenantId, isPrimaryPayer: false },
    ];
    expect(contractFormSchema.safeParse({ ...base(), parties }).success).toBe(false);
    expect(stepSchemas.parties.safeParse({ parties }).success).toBe(false);
  });

  it("requires complete terms and a positive deposit value", () => {
    const missingAnchor = stepSchemas.terms.safeParse({ ...base(), billingAnchor: "" });
    expect(missingAnchor.success).toBe(false);
    if (!missingAnchor.success)
      expect(missingAnchor.error.issues[0]?.message).toBe("请选择计费方式");
    const missingInterval = stepSchemas.terms.safeParse({ ...base(), paymentIntervalMonths: "" });
    expect(missingInterval.success).toBe(false);
    if (!missingInterval.success)
      expect(missingInterval.error.issues[0]?.message).toBe("请选择付款周期");
    expect(stepSchemas.terms.safeParse({ ...base(), dueDaysBeforeText: "91" }).success).toBe(false);
    expect(
      stepSchemas.terms.safeParse({
        ...base(),
        deposits: [
          {
            type: "rental",
            customName: "",
            calculationMode: "fixed_amount",
            fixedAmountText: "0",
          },
        ],
      }).success,
    ).toBe(false);
    expect(contractFormSchema.safeParse({ ...base(), billingAnchor: "" }).success).toBe(false);
    expect(contractFormSchema.safeParse({ ...base(), dueDaysBeforeText: "91" }).success).toBe(
      false,
    );
    expect(
      contractFormSchema.safeParse({
        ...base(),
        deposits: [
          {
            type: "rental",
            customName: "",
            calculationMode: "fixed_amount",
            fixedAmountText: "",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      stepSchemas.terms.safeParse({
        ...base(),
        deposits: [
          {
            type: "rental",
            customName: "",
            calculationMode: "rent_multiple",
            fixedAmountText: "",
            rentMultipleText: "",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires a monthly rent before completing the terms step", () => {
    const result = stepSchemas.terms.safeParse({ ...base(), rentAmountText: "" });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["rentAmountText"], message: "请输入月租" }),
      );
  });

  it("requires allocations to be all present and equal to rent", () => {
    expect(
      contractFormSchema.safeParse({ ...base(), spaces: [{ spaceId, rentAllocationText: "80" }] })
        .success,
    ).toBe(false);
    expect(
      contractFormSchema.safeParse({ ...base(), spaces: [{ spaceId, rentAllocationText: "8000" }] })
        .success,
    ).toBe(true);
  });

  it("keeps full and terms schemas aligned for allocation validation", () => {
    const values = {
      ...base(),
      spaces: [
        { spaceId, rentAllocationText: "5000" },
        { spaceId: propertyId, rentAllocationText: "" },
      ],
    };
    expect(contractFormSchema.safeParse(values).success).toBe(false);
    expect(stepSchemas.terms.safeParse(values).success).toBe(false);
  });

  it("rejects whitespace-padded due days in both complete schemas", () => {
    const values = { ...base(), dueDaysBeforeText: " 1 " };
    expect(contractFormSchema.safeParse(values).success).toBe(false);
    expect(stepSchemas.terms.safeParse(values).success).toBe(false);
  });

  it("maps terms spaces and allocation into the update request", () => {
    const request = toStepUpdateRequest(
      "423e4567-e89b-42d3-a456-426614174000",
      {
        ...base(),
        spaces: [{ spaceId, rentAllocationText: "8000" }],
      },
      2,
    );
    expect(request.spaces).toEqual([{ spaceId, rentAllocationMinor: 800000 }]);
  });

  it("maps server minor units back to editable yuan strings", () => {
    const values = toContractFormValues({
      ...baseContract(),
      rentAmountMinor: 800000,
      spaces: [
        { spaceId, spaceName: "101", spaceCode: null, spacePath: [], rentAllocationMinor: 800000 },
      ],
      depositTerms: [
        {
          id: "deposit",
          type: "rental",
          customName: null,
          calculationMode: "fixed_amount",
          fixedAmountMinor: 160000,
          rentMultiple: null,
          finalAmountMinor: 160000,
          sortOrder: 0,
        },
      ],
    });
    expect(values.rentAmountText).toBe("8000");
    expect(values.spaces[0]?.rentAllocationText).toBe("8000");
    expect(values.deposits[0]?.fixedAmountText).toBe("1600");
  });

  it("drops rent-multiple terms from old drafts while keeping fixed deposit amounts", () => {
    const values = toContractFormValues({
      ...baseContract(),
      depositTerms: [
        {
          id: "legacy",
          type: "rental",
          customName: null,
          calculationMode: "rent_multiple" as const,
          fixedAmountMinor: null,
          rentMultiple: "2",
          finalAmountMinor: 160000,
          sortOrder: 0,
        },
        {
          id: "fixed",
          type: "access_card",
          customName: null,
          calculationMode: "fixed_amount" as const,
          fixedAmountMinor: 5000,
          rentMultiple: null,
          finalAmountMinor: 5000,
          sortOrder: 1,
        },
      ],
    });

    expect(values.deposits).toEqual([
      {
        type: "access_card",
        customName: "",
        calculationMode: "fixed_amount",
        fixedAmountText: "50",
      },
    ]);
    expect(
      toStepUpdateRequest(baseContract().id, { ...base(), deposits: values.deposits }, 2),
    ).toMatchObject({
      depositTerms: [
        { type: "access_card", calculationMode: "fixed_amount", fixedAmountMinor: 5000 },
      ],
    });
  });

  it("rejects rent-multiple deposits in the contract form", () => {
    expect(
      stepSchemas.terms.safeParse({
        ...base(),
        deposits: [
          {
            type: "rental",
            customName: "",
            calculationMode: "rent_multiple",
            fixedAmountText: "",
            rentMultipleText: "2",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("allows the create checkpoint to carry only an active property id", () => {
    expect(toCreateContractRequest({ propertyId })).toEqual({ propertyId });
  });

  it("maps only visible deposit fields and nullable terms into the payload", () => {
    const request = toStepUpdateRequest(
      "423e4567-e89b-42d3-a456-426614174000",
      {
        ...base(),
        externalContractNumber: "  ",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        rentAmountText: "8000",
        billingAnchor: "contract_start",
        paymentIntervalMonths: "1",
        dueDaysBeforeText: "0",
        note: "  ",
        deposits: [
          {
            type: "other",
            customName: " 清洁费 ",
            calculationMode: "fixed_amount",
            fixedAmountText: "100",
          },
          {
            type: "utility",
            customName: "应被清理",
            calculationMode: "fixed_amount",
            fixedAmountText: "150",
          },
        ],
      },
      2,
    );
    expect(request).toMatchObject({
      externalContractNumber: null,
      rentAmountMinor: 800000,
      dueDaysBefore: 0,
      note: null,
      depositTerms: [
        {
          type: "other",
          customName: "清洁费",
          calculationMode: "fixed_amount",
          fixedAmountMinor: 10000,
        },
        {
          type: "utility",
          calculationMode: "fixed_amount",
          fixedAmountMinor: 15000,
        },
      ],
    });
    expect(request.depositTerms?.[0]).not.toHaveProperty("rentMultiple");
    expect(request.depositTerms?.[1]).not.toHaveProperty("rentMultiple");
    expect(request.depositTerms?.[1]).not.toHaveProperty("customName");
  });
});

function baseContract() {
  return {
    id: "423e4567-e89b-42d3-a456-426614174000",
    propertyId,
    propertyName: "房产",
    contractNumber: "DRAFT-1",
    externalContractNumber: null,
    lifecycleStatus: "draft" as const,
    displayStatus: "draft" as const,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    actualEndDate: null,
    rentAmountMinor: null,
    tenantNames: [],
    spaceNames: [],
    updatedAt: "2026-09-01T00:00:00.000Z",
    billingAnchor: "contract_start" as const,
    paymentIntervalMonths: 1 as const,
    dueDaysBefore: 0,
    hasScheduledTermination: false,
    renewedFromContractId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: null,
    spaces: [],
    parties: [
      {
        tenantId,
        type: "individual" as const,
        name: "租户",
        phone: null,
        email: null,
        primaryContactName: null,
        primaryContactPhone: null,
        documentCountryCode: null,
        documentType: null,
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        validFrom: null,
        validTo: null,
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [],
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}
