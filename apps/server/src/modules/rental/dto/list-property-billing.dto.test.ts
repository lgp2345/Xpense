import { expect, it } from "vitest";
import { listPropertyBillingSchema } from "./list-property-billing.dto.js";

const propertyId = "00000000-0000-4000-8000-000000000001";
it("默认100及合法游标", () =>
  expect(listPropertyBillingSchema.parse({ propertyId })).toEqual({ propertyId, pageSize: 100 }));
it.each([
  { pageSize: 0 },
  { pageSize: 101 },
  { afterContractId: "bad" },
  { propertyId: "bad" },
  { extra: true },
])("拒绝非法输入 %j", (patch) =>
  expect(listPropertyBillingSchema.safeParse({ propertyId, ...patch }).success).toBe(false));
