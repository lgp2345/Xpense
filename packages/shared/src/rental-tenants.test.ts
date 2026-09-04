import { describe, expect, it } from "vitest";

import type {
  CreateRentalTenantRequest,
  RentalTenantDetail,
  RentalTenantPage,
  RentalTenantSensitiveDetail,
  SetRentalTenantStatusRequest,
  UpdateRentalTenantRequest,
} from "./rental-tenants.js";

const tenantDetailContract = {
  id: "tenant-1",
  type: "individual",
  name: "王小明",
  phone: "13800000000",
  email: "wang@example.com",
  primaryContactName: null,
  primaryContactPhone: null,
  documentCountryCode: "CN",
  documentType: "national_id",
  documentTypeOtherName: null,
  maskedDocumentNumber: "**************1234",
  isActive: true,
  contractCount: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
  note: null,
  createdAt: "2026-08-30T00:00:00.000Z",
} satisfies RentalTenantDetail;

const tenantSensitiveDetailContract = {
  tenantId: "tenant-1",
  documentNumber: "440300199001011234",
  birthDate: "1990-01-01",
  gender: "male",
  ethnicity: "汉族",
  documentAddress: "深圳市南山区",
} satisfies RentalTenantSensitiveDetail;

const tenantPageContract = {
  items: [tenantDetailContract],
  total: 1,
  page: 1,
  pageSize: 20,
} satisfies RentalTenantPage;

const createTenantContract = {
  type: "individual",
  name: "王小明",
  documentCountryCode: "CN",
  documentType: "national_id",
  documentNumber: "440300199001011234",
  birthDate: "1990-01-01",
  gender: "male",
} satisfies CreateRentalTenantRequest;

const updateTenantContract = {
  id: "tenant-1",
  email: "new-email@example.com",
} satisfies UpdateRentalTenantRequest;

const setTenantStatusContract = {
  id: "tenant-1",
  isActive: false,
} satisfies SetRentalTenantStatusRequest;

describe("rental tenant shared contracts", () => {
  it("publishes the stable tenant and identity vocabularies", async () => {
    const shared = await import("./index.js");

    expect(shared.rentalTenantTypes).toEqual(["individual", "company"]);
    expect(shared.rentalIdentityDocumentTypes).toEqual([
      "national_id",
      "passport",
      "residence_permit",
      "business_registration",
      "other",
    ]);
    expect(shared.rentalGenders).toEqual(["male", "female", "unspecified"]);
  });

  it("keeps tenant data, sensitive data, and status actions in separate shapes", () => {
    expect(tenantDetailContract.maskedDocumentNumber).toBe("**************1234");
    expect(tenantSensitiveDetailContract.documentNumber).toBe("440300199001011234");
    expect(tenantPageContract.items).toEqual([tenantDetailContract]);
    expect(createTenantContract.type).toBe("individual");
    expect(updateTenantContract.email).toBe("new-email@example.com");
    expect(setTenantStatusContract.isActive).toBe(false);
  });
});
