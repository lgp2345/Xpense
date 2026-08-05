export const API_CODES = {
  ok: "OK",
  validationFailed: "VALIDATION_FAILED",
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  tooManyRequests: "TOO_MANY_REQUESTS",
  internalError: "INTERNAL_ERROR",
  serviceUnavailable: "SERVICE_UNAVAILABLE",
} as const;

export type ApiCode = (typeof API_CODES)[keyof typeof API_CODES];

export type ApiResponse<T> = {
  code: ApiCode;
  message: string;
  data: T;
};

export type ApiErrorResponse = ApiResponse<null>;

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record.code === "string" && typeof record.message === "string" && "data" in record;
}
