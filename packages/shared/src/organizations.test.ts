import { expectTypeOf, it } from "vitest";

import type {
  CreateOrganizationInput,
  OrganizationDetail,
  OwnerInput,
  UpdateOrganizationProfileInput,
} from "./organizations.js";

it("keeps association confirmation and immutable profile fields in the public contract", () => {
  expectTypeOf<Extract<OwnerInput, { kind: "existing" }>["confirmed"]>().toEqualTypeOf<true>();
  expectTypeOf<CreateOrganizationInput["baseCurrency"]>().toEqualTypeOf<"CNY" | "USD">();
  expectTypeOf<keyof UpdateOrganizationProfileInput>().toEqualTypeOf<
    "contactName" | "contactPhone" | "address"
  >();
  expectTypeOf<OrganizationDetail["owners"][number]["email"]>().toEqualTypeOf<string | null>();
});
