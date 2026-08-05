import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

import { apiErrorCodes } from "../errors/api-error.js";

function codeForHttpStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return apiErrorCodes.validationFailed;
    case HttpStatus.UNAUTHORIZED:
      return apiErrorCodes.unauthenticated;
    case HttpStatus.FORBIDDEN:
      return apiErrorCodes.forbidden;
    case HttpStatus.NOT_FOUND:
      return apiErrorCodes.notFound;
    case HttpStatus.CONFLICT:
      return apiErrorCodes.conflict;
    case HttpStatus.TOO_MANY_REQUESTS:
      return apiErrorCodes.tooManyRequests;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return apiErrorCodes.serviceUnavailable;
    default:
      return apiErrorCodes.internalError;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = apiErrorCodes.internalError;
    let message = "服务器内部错误";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "string") {
        message = body;
        code = codeForHttpStatus(status);
      } else if (body !== null && typeof body === "object") {
        const record = body as Record<string, unknown>;

        if (typeof record.code === "string") {
          code = record.code;
        }

        if (Array.isArray(record.errors) || Array.isArray(record.message)) {
          status = HttpStatus.BAD_REQUEST;
          code = apiErrorCodes.validationFailed;
          message = "参数校验失败";
        } else if (typeof record.message === "string") {
          message = record.message;
        }
      }

      if (status !== HttpStatus.INTERNAL_SERVER_ERROR && code === apiErrorCodes.internalError) {
        code = codeForHttpStatus(status);
      }
    } else {
      this.logger.error({
        message: "未捕获异常",
        error: exception instanceof Error ? exception.message : String(exception),
      });
    }

    httpAdapter.reply(ctx.getResponse(), { code, message, data: null }, status);
  }
}
