import type { ArgumentsHost } from "@nestjs/common";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { AbstractHttpAdapter, HttpAdapterHost } from "@nestjs/core";
import { ZodValidationException } from "nestjs-zod";
import { describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function createHarness() {
  const reply = vi.fn();
  const filter = new AllExceptionsFilter({
    httpAdapter: { reply } as unknown as AbstractHttpAdapter,
  } as unknown as HttpAdapterHost);
  const response = {};
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { filter, host, reply, response };
}

describe("AllExceptionsFilter", () => {
  it("passes explicit business codes and messages through", () => {
    const { filter, host, reply, response } = createHarness();

    filter.catch(
      new UnauthorizedException({ code: "UNAUTHENTICATED", message: "未登录或登录已过期" }),
      host,
    );

    expect(reply).toHaveBeenCalledWith(
      response,
      { code: "UNAUTHENTICATED", message: "未登录或登录已过期", data: null },
      401,
    );
  });

  it("derives the code from the HTTP status for plain exceptions", () => {
    const { filter, host, reply, response } = createHarness();

    filter.catch(new ForbiddenException("没有权限"), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      { code: "FORBIDDEN", message: "没有权限", data: null },
      403,
    );
  });

  it("maps validation errors to VALIDATION_FAILED", () => {
    const { filter, host, reply, response } = createHarness();

    filter.catch(
      new ZodValidationException({
        issues: [{ code: "invalid_type", path: ["email"], message: "Invalid email" }],
      }),
      host,
    );

    expect(reply).toHaveBeenCalledWith(
      response,
      { code: "VALIDATION_FAILED", message: "参数校验失败", data: null },
      400,
    );
  });

  it("maps not-found and service-unavailable responses", () => {
    const { filter, host, reply } = createHarness();

    filter.catch(new NotFoundException("角色不存在"), host);
    expect(reply.mock.calls[0]?.[1]).toEqual({
      code: "NOT_FOUND",
      message: "角色不存在",
      data: null,
    });

    filter.catch(new ServiceUnavailableException("服务未就绪"), host);
    expect(reply.mock.calls[1]?.[1]).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "服务未就绪",
      data: null,
    });
  });

  it("falls back to a generic internal error for unknown exceptions", () => {
    const { filter, host, reply, response } = createHarness();

    filter.catch(new Error("boom"), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      { code: "INTERNAL_ERROR", message: "服务器内部错误", data: null },
      500,
    );
    expect(reply.mock.calls[0]?.[1]?.message).not.toContain("boom");
  });

  it("handles array messages from generic bad requests as validation failures", () => {
    const { filter, host, reply, response } = createHarness();

    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ["field is required"],
        error: "Bad Request",
      }),
      host,
    );

    expect(reply).toHaveBeenCalledWith(
      response,
      { code: "VALIDATION_FAILED", message: "参数校验失败", data: null },
      400,
    );
  });
});
