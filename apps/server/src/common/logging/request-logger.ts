import { Logger } from "@nestjs/common";

import { requestContext } from "../request-context/request-context.js";

export type StructuredLogMessage = Record<string, unknown>;

type LoggerDelegate = {
  error(message: unknown): void;
  warn?(message: unknown): void;
  log?(message: unknown): void;
};

export function createRequestLogger(
  context: string,
  delegate: LoggerDelegate = new Logger(context),
) {
  return {
    error(message: StructuredLogMessage): void {
      delegate.error(withRequestId(message));
    },
    warn(message: StructuredLogMessage): void {
      delegate.warn?.(withRequestId(message));
    },
    log(message: StructuredLogMessage): void {
      delegate.log?.(withRequestId(message));
    },
  };
}

function withRequestId(message: StructuredLogMessage): StructuredLogMessage {
  const requestId = requestContext.getRequestId();

  return requestId === null ? message : { ...message, requestId };
}
