import { describe, expect, it } from "vitest";

import {
  contractFormSchema,
  defaultContractFormValues,
  parseMinor,
  stepSchemas,
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
    expect(contractFormSchema.safeParse({ ...base(), startDate: date }).success).toBe(false);
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
    expect(stepSchemas.terms.safeParse({ ...base(), billingAnchor: "" }).success).toBe(false);
    expect(stepSchemas.terms.safeParse({ ...base(), paymentIntervalMonths: "" }).success).toBe(
      false,
    );
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
            rentMultipleText: "",
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
            rentMultipleText: "",
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
            rentMultipleText: "9",
          },
          {
            type: "utility",
            customName: "应被清理",
            calculationMode: "rent_multiple",
            fixedAmountText: "100",
            rentMultipleText: "1.5",
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
          calculationMode: "rent_multiple",
          rentMultiple: "1.5",
        },
      ],
    });
    expect(request.depositTerms?.[0]).not.toHaveProperty("rentMultiple");
    expect(request.depositTerms?.[1]).not.toHaveProperty("fixedAmountMinor");
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
