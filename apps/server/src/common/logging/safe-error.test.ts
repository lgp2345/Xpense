import { describe, expect, it } from "vitest";
import { safeError } from "./safe-error.js";

describe("safeError", () => {
  it("preserves original error types, messages, codes and complete stacks", () => {
    const cause = Object.assign(new Error("connection diagnostic"), { code: "CUSTOM_DB_CODE" });
    const error = new Error("空间祖先路径不完整\n查询房产计费失败", { cause });
    error.name = "BillingPathError";
    error.stack = "BillingPathError: 空间祖先路径不完整\n    at scanSources (/app/service.ts:12:4)";
    expect(safeError(error)).toEqual({
      type: "BillingPathError",
      message: "空间祖先路径不完整\n查询房产计费失败",
      stack: "BillingPathError: 空间祖先路径不完整\n    at scanSources (/app/service.ts:12:4)",
      cause: {
        type: "Error",
        code: "CUSTOM_DB_CODE",
        message: "connection diagnostic",
        stack: cause.stack,
      },
    });
  });

  it("preserves causes beyond two levels", () => {
    const error = new Error("outer", {
      cause: new Error("second", { cause: new Error("third", { cause: new Error("root") }) }),
    });
    expect(safeError(error).cause?.cause?.cause?.message).toBe("root");
  });

  it("terminates cyclic causes and retains non-Error diagnostics", () => {
    const error = new Error("cyclic diagnostic");
    error.cause = error;
    expect(() => JSON.stringify(safeError(error))).not.toThrow();
    expect(safeError(error).message).toBe("cyclic diagnostic");
    expect(safeError({ reason: "unexpected result" }).message).toContain("unexpected result");
  });
});
