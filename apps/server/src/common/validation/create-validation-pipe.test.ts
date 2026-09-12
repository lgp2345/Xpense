import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createValidationPipe } from "./create-validation-pipe.js";

describe("createValidationPipe", () => {
  it("returns the transformed schema output", async () => {
    const schema = z.object({ page: z.coerce.number().int().min(1).default(1) });

    await expect(
      createValidationPipe().transform({ page: "2" }, { type: "query", schema } as Parameters<
        ReturnType<typeof createValidationPipe>["transform"]
      >[1]),
    ).resolves.toEqual({ page: 2 });
  });

  it("creates the stable API validation exception", async () => {
    const schema = z.object({ id: z.string().uuid() });

    const result = createValidationPipe().transform({ id: "invalid" }, {
      type: "body",
      schema,
    } as Parameters<ReturnType<typeof createValidationPipe>["transform"]>[1]);

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toMatchObject({
      response: {
        code: "VALIDATION_FAILED",
        message: "参数校验失败",
      },
    });
  });
});
