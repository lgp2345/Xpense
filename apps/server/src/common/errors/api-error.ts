export const apiErrorCodes = {
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  validationFailed: "VALIDATION_FAILED",
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];
