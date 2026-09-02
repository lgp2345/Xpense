import { describe, expect, it } from "vitest";

import { updateTenantSchema } from "./dto/update-tenant.dto.js";
import {
  assertTenantFields,
  mergeTenantUpdate,
  type RentalTenantMutableValues,
  toSensitiveIdentity,
} from "./tenant.rules.js";

const individual: RentalTenantMutableValues = {
  type: "individual",
  name: "张三",
  phone: null,
  email: null,
  primaryContactName: null,
  documentCountryCode: "CN",
  documentType: "national_id",
  documentTypeOtherName: null,
  documentNumber: "110101199001011234",
  birthDate: "1990-01-01",
  gender: "male",
  ethnicity: "汉",
  documentAddress: "北京市东城区",
  note: null,
};

describe("租户字段纯规则", () => {
  it("限制个人与企业各自不适用的字段", () => {
    expect(() => assertTenantFields({ type: "company", birthDate: "1990-01-01" })).toThrow();
    expect(() =>
      assertTenantFields({ type: "individual", primaryContactName: "联系人" }),
    ).toThrow();
    expect(() =>
      assertTenantFields({ type: "company", name: "星海公司", primaryContactName: "王经理" }),
    ).not.toThrow();
  });

  it("仅允许中国证件填写民族，并约束 other 证件名称", () => {
    expect(() =>
      assertTenantFields({
        ...individual,
        documentCountryCode: "US",
        ethnicity: "汉",
      }),
    ).toThrow();
    expect(() =>
      assertTenantFields({
        ...individual,
        documentType: "other",
        documentTypeOtherName: null,
      }),
    ).toThrow();
    expect(() =>
      assertTenantFields({
        ...individual,
        documentTypeOtherName: "其他证件",
      }),
    ).toThrow();
  });

  it("要求证件字段全有或全无，并允许没有敏感身份资料", () => {
    expect(() =>
      assertTenantFields({
        type: "individual",
        name: "张三",
        documentNumber: "110101199001011234",
      }),
    ).toThrow();
    expect(() => assertTenantFields({ type: "individual", name: "张三" })).not.toThrow();
    expect(toSensitiveIdentity({ type: "individual", name: "张三" })).toBeNull();
    expect(toSensitiveIdentity(individual)).toEqual({
      documentNumber: "110101199001011234",
      birthDate: "1990-01-01",
      gender: "male",
      ethnicity: "汉",
      documentAddress: "北京市东城区",
    });
  });

  it("合并更新后按完整快照验证字段关系", () => {
    expect(() => mergeTenantUpdate(individual, { type: "company" })).toThrow();
    expect(
      mergeTenantUpdate(
        {
          ...individual,
          primaryContactName: null,
          birthDate: null,
          gender: null,
          ethnicity: null,
          documentAddress: null,
        },
        {
          type: "company",
          primaryContactName: "王经理",
          documentType: "business_registration",
        },
      ),
    ).toMatchObject({ type: "company", primaryContactName: "王经理" });
  });

  it("只合并明确提供的可变字段，并保留 DTO 外的 id", () => {
    const current = { ...individual, phone: "13800000000", email: "zhang@example.com" };
    const parsed = updateTenantSchema.parse({
      id: "423e4567-e89b-12d3-a456-426614174000",
      phone: undefined,
      email: undefined,
      note: null,
    });

    const merged = mergeTenantUpdate(current, parsed);

    expect(merged).toMatchObject({
      phone: "13800000000",
      email: "zhang@example.com",
      note: null,
    });
    expect(merged).not.toHaveProperty("id");
    const currentWithMetadata = {
      ...current,
      id: "current-id",
      internalMarker: "must-not-leak",
    };
    const rebuilt = mergeTenantUpdate(currentWithMetadata, {});
    expect(rebuilt).not.toHaveProperty("id");
    expect(rebuilt).not.toHaveProperty("internalMarker");
    expect(
      mergeTenantUpdate(
        current,
        updateTenantSchema.parse({ id: "423e4567-e89b-12d3-a456-426614174000", phone: null }),
      ).phone,
    ).toBeNull();
  });
});
