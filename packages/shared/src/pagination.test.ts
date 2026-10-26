import { describe, expect, it } from "vitest";

import type { PageResult } from "./index.js";

describe("pagination shared contract", () => {
  it("exports a generic page result from the shared package", () => {
    const result: PageResult<string> = {
      items: ["rental-1"],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    expect(result).toEqual({ items: ["rental-1"], total: 1, page: 1, pageSize: 20 });
  });
});
