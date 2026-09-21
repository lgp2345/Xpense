import { API_CODES } from "@xpense/shared";

/** status 为 0 表示没有收到 HTTP 响应；requestId 只来自服务端响应。 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isSystemError(error: ApiError): boolean {
  return (
    error.status >= 500 ||
    error.code === API_CODES.internalError ||
    error.code === API_CODES.serviceUnavailable
  );
}

export function apiErrorMessage(status: number, code: string, message: string): string {
  if (status === 0) return "网络异常，请检查网络连接";
  if (status === 503 || code === API_CODES.serviceUnavailable) return "服务暂时不可用，请稍后重试";
  if (status >= 500) return "服务器内部错误，请稍后重试";
  return message;
}
