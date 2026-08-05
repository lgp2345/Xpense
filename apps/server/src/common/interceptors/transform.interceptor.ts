import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { ApiResponse } from "@xpense/shared";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

import { apiErrorCodes } from "../errors/api-error.js";

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: apiErrorCodes.ok,
        message: "ok",
        data: data ?? null,
      })),
    );
  }
}
