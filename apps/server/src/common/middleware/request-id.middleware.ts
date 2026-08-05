import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { requestContext } from "../request-context/request-context.js";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUEST_ID_MAX_LENGTH = 128;

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (
    value !== undefined &&
    value.length > 0 &&
    value.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  ) {
    return value;
  }

  return randomUUID();
}

export function requestIdMiddleware(
  request: IncomingMessage,
  reply: ServerResponse,
  next: () => void,
): void {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  reply.setHeader("X-Request-Id", requestId);
  requestContext.run(requestId, next);
}
