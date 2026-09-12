import { BadRequestException, StandardSchemaValidationPipe } from "@nestjs/common";

import { apiErrorCodes } from "../errors/api-error.js";

/**
 * 创建全局 Standard Schema 校验器。
 * 保留 schema 的默认值、强制转换和 transform 输出，并统一客户端可见的校验错误。
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: () =>
      new BadRequestException({
        code: apiErrorCodes.validationFailed,
        message: "参数校验失败",
      }),
  });
}
