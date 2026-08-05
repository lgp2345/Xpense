import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import { TransformInterceptor } from "./transform.interceptor.js";

describe("TransformInterceptor", () => {
  const interceptor = new TransformInterceptor();
  const context = {} as ExecutionContext;

  it("wraps handler results in the API envelope", async () => {
    const next = { handle: () => of({ id: "role-1" }) } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      code: "OK",
      message: "ok",
      data: { id: "role-1" },
    });
  });

  it("normalizes undefined results to null", async () => {
    const next = { handle: () => of(undefined) } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      code: "OK",
      message: "ok",
      data: null,
    });
  });
});
