import type { RentalTenantDetail } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import {
  clearTenantTypeSpecificValues,
  defaultTenantFormValues,
  tenantFormSchema,
  toCreateTenantRequest,
  toUpdateTenantRequest,
} from "./tenant-form-schema";

const baseValues = {
  type: "individual" as const,
  name: "  张三  ",
  phone: " 13800000000 ",
  email: " zhang@example.com ",
  primaryContactName: " 张三 ",
  primaryContactPhone: " 13900000000 ",
  documentCountryCode: "CN",
  documentType: "national_id" as const,
  documentTypeOtherName: "",
  documentNumber: "110101199001010011",
  birthDate: "1990-01-01",
  gender: "male" as const,
  ethnicity: "汉族",
  documentAddress: "北京市",
  note: "",
};

describe("tenant form schema", () => {
  it("requires a non-blank name and supported tenant type", () => {
    expect(tenantFormSchema.safeParse({ ...baseValues, name: "   " }).success).toBe(false);
    expect(tenantFormSchema.safeParse({ ...baseValues, type: "unknown" }).success).toBe(false);
  });

  it("requires a custom document type name only for the individual other option", () => {
    expect(
      tenantFormSchema.safeParse({
        ...baseValues,
        documentType: "other",
        documentTypeOtherName: "",
      }).success,
    ).toBe(false);
    expect(
      tenantFormSchema.safeParse({
        ...baseValues,
        documentType: "other",
        documentTypeOtherName: "工作证",
      }).success,
    ).toBe(true);
  });

  it("requires both contact fields for companies and allows them for individuals", () => {
    expect(
      tenantFormSchema.safeParse({
        ...baseValues,
        type: "company",
        primaryContactName: "",
        primaryContactPhone: "",
      }).success,
    ).toBe(false);
    expect(
      tenantFormSchema.safeParse({
        ...baseValues,
        type: "individual",
        primaryContactName: "联系人",
        primaryContactPhone: "13900000000",
      }).success,
    ).toBe(true);
  });

  it("clears identity fields when switching to a company and custom type when leaving other", () => {
    expect(
      clearTenantTypeSpecificValues({
        ...baseValues,
        type: "company",
        documentType: "other",
        documentTypeOtherName: "工作证",
      }),
    ).toMatchObject({
      type: "company",
      documentCountryCode: "",
      documentType: "",
      documentTypeOtherName: "",
      documentNumber: "",
      birthDate: "",
      gender: "",
      ethnicity: "",
      documentAddress: "",
    });
    expect(
      clearTenantTypeSpecificValues({
        ...baseValues,
        documentType: "national_id",
        documentTypeOtherName: "旧类型",
      }),
    ).toMatchObject({ documentTypeOtherName: "" });
  });

  it("omits empty optional values and excludes individual identity from company create payload", () => {
    expect(
      toCreateTenantRequest({
        ...baseValues,
        type: "company",
        name: "  公司  ",
        documentNumber: "不应发送",
        birthDate: "1990-01-01",
      }),
    ).toEqual({
      type: "company",
      name: "公司",
      phone: "13800000000",
      email: "zhang@example.com",
      primaryContactName: "张三",
      primaryContactPhone: "13900000000",
    });
  });

  it("does not submit an untouched masked identity value during edit", () => {
    const initial = defaultTenantFormValues({
      id: "tenant-1",
      type: "individual",
      name: "张三",
      phone: null,
      email: null,
      primaryContactName: null,
      primaryContactPhone: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: "********0011",
      isActive: true,
      contractCount: 0,
      updatedAt: "2026-08-01T00:00:00.000Z",
      note: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    } satisfies RentalTenantDetail);
    const input = toUpdateTenantRequest("tenant-1", initial, initial);
    expect(input).toBeNull();
    expect(
      toUpdateTenantRequest(
        "tenant-1",
        { ...initial, documentNumber: "110101199001010011" },
        initial,
      ),
    ).toEqual({ id: "tenant-1", documentNumber: "110101199001010011" });
  });
});
