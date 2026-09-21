import { describe, expect, it } from "vitest";
import { safeError } from "./safe-error.js";

describe("safeError", () => {
  it("keeps known causes and locations without free text, SQL or arbitrary fields", () => {
    const cause = Object.assign(new Error("private connection"), {
      code: "23505",
      detail: "private row",
    });
    const error = Object.assign(new Error("private SQL", { cause }), {
      params: ["private parameter"],
    });
    error.stack =
      "Error: private SQL\n    at privateFunction (/app/service.ts:12:4)\nprivate multiline detail";
    expect(safeError(error)).toMatchObject({
      type: "Error",
      stack: "/app/service.ts:12:4",
      cause: { code: "23505", message: "数据库唯一约束冲突" },
    });
    expect(JSON.stringify(safeError(error))).not.toContain("private");
  });
  it("bounds cyclic causes and safely handles arbitrary thrown values", () => {
    const error = new Error("private");
    error.cause = error;
    expect(safeError(error).cause?.cause?.cause).toBeUndefined();
    expect(JSON.stringify(safeError({ password: "private" }))).not.toContain("private");
  });
});
