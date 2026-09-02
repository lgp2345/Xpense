import { describe, expect, it } from "vitest";

import type {
  ChangeRentalContractPartiesRequest,
  CreateRentalContractRequest,
  RentalContractAvailability,
  RentalContractDetail,
  RentalContractPage,
  RentalContractPartySensitiveDetail,
  UpdateRentalContractRequest,
} from "./rental-contracts.js";

const contractDetailContract = {
  id: "contract-1",
  propertyId: "property-1",
  propertyName: "阳光公寓",
  contractNumber: "RC-2026-000001",
  externalContractNumber: null,
  lifecycleStatus: "confirmed",
  displayStatus: "active",
  startDate: "2026-08-01",
  endDate: "2027-07-31",
  actualEndDate: "2027-07-31",
  rentAmountMinor: 8_000_00,
  tenantNames: ["王小明"],
  spaceNames: ["101"],
  updatedAt: "2026-08-30T00:00:00.000Z",
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
  hasScheduledTermination: false,
  renewedFromContractId: null,
  cancellationReason: null,
  terminationDate: null,
  terminationReason: null,
  note: null,
  spaces: [
    {
      spaceId: "space-1",
      spaceName: "101",
      spaceCode: null,
      spacePath: [{ id: "space-1", name: "101" }],
      rentAllocationMinor: 8_000_00,
    },
  ],
  parties: [
    {
      tenantId: "tenant-1",
      type: "individual",
      name: "王小明",
      phone: "13800000000",
      email: null,
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: "**************1234",
      validFrom: "2026-08-01",
      validTo: "2027-07-31",
      isPrimaryPayer: true,
    },
  ],
  depositTerms: [
    {
      id: "deposit-1",
      type: "rental",
      customName: null,
      calculationMode: "fixed_amount",
      fixedAmountMinor: 16_000_00,
      rentMultiple: null,
      finalAmountMinor: 16_000_00,
      sortOrder: 0,
    },
  ],
  createdAt: "2026-08-30T00:00:00.000Z",
} satisfies RentalContractDetail;

const contractPageContract = {
  items: [contractDetailContract],
  total: 1,
  page: 1,
  pageSize: 20,
} satisfies RentalContractPage;

const contractAvailabilityContract = {
  available: false,
  conflicts: [
    {
      contractId: "contract-2",
      contractNumber: "RC-2026-000002",
      spaceId: "space-1",
      spaceName: "101",
    },
  ],
} satisfies RentalContractAvailability;

const partySensitiveDetailContract = {
  contractId: "contract-1",
  tenantId: "tenant-1",
  validFrom: "2026-08-01",
  validTo: "2027-07-31",
  documentNumber: "440300199001011234",
  birthDate: "1990-01-01",
  gender: "male",
  ethnicity: "汉族",
  documentAddress: "深圳市南山区",
} satisfies RentalContractPartySensitiveDetail;

const createContractRequest = {
  propertyId: "property-1",
  startDate: "2026-08-01",
  endDate: "2027-07-31",
  rentAmountMinor: 8_000_00,
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
  parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
  spaces: [{ spaceId: "space-1", rentAllocationMinor: 8_000_00 }],
} satisfies CreateRentalContractRequest;

const updateContractRequest = {
  id: "contract-1",
  rentAmountMinor: 8_500_00,
} satisfies UpdateRentalContractRequest;

const changePartiesRequest = {
  id: "contract-1",
  effectiveDate: "2026-09-01",
  reason: "主付款人变更",
  parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
} satisfies ChangeRentalContractPartiesRequest;

// @ts-expect-error 变更合同承租方必须记录原因，不能退化为可选字段。
const changePartiesRequestWithoutReason: ChangeRentalContractPartiesRequest = {
  id: "contract-1",
  effectiveDate: "2026-09-01",
  parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
};

describe("rental contract shared contracts", () => {
  it("publishes lifecycle, display, billing, deposit, and lease vocabularies", async () => {
    const shared = await import("./index.js");

    expect(shared.rentalContractLifecycleStatuses).toEqual([
      "draft",
      "confirmed",
      "cancelled",
      "terminated",
    ]);
    expect(shared.rentalContractDisplayStatuses).toEqual([
      "draft",
      "upcoming",
      "active",
      "expiring_soon",
      "expired",
      "cancelled",
      "terminated",
    ]);
    expect(shared.rentalBillingAnchors).toEqual(["contract_start", "calendar_month"]);
    expect(shared.rentalDepositTypes).toEqual(["rental", "utility", "access_card", "other"]);
    expect(shared.rentalDepositCalculationModes).toEqual(["fixed_amount", "rent_multiple"]);
    expect(shared.rentalLeaseStatuses).toEqual(["vacant", "upcoming", "active", "expiring_soon"]);
    expect(shared.rentalLeaseBlockedReasons).toEqual(["ancestor_contract", "descendant_contract"]);
  });

  it("uses string dates and decimal rent multiples while retaining minor-unit amounts as numbers", () => {
    expect(contractDetailContract.rentAmountMinor).toBe(8_000_00);
    expect(contractPageContract.items).toEqual([contractDetailContract]);
    expect(contractAvailabilityContract.conflicts[0]?.contractNumber).toBe("RC-2026-000002");
    expect(partySensitiveDetailContract.documentNumber).toBe("440300199001011234");
    expect(createContractRequest.startDate).toBe("2026-08-01");
    expect(updateContractRequest.rentAmountMinor).toBe(8_500_00);
    expect(changePartiesRequest.parties[0]?.isPrimaryPayer).toBe(true);
    expect(changePartiesRequest.reason).toBe("主付款人变更");
    expect(changePartiesRequestWithoutReason).not.toHaveProperty("reason");
  });
});
