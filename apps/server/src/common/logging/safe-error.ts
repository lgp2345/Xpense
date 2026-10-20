import { inspect } from "node:util";

export type SafeError = {
  type: string;
  message: string;
  code?: string;
  stack?: string;
  cause?: SafeError;
};

/** 原样序列化异常诊断信息，仅处理 cause 循环以保证日志可输出。 */
export function safeError(error: unknown, seen = new WeakSet<Error>()): SafeError {
  if (!(error instanceof Error))
    return {
      type: "UnknownError",
      message: inspect(error, { depth: null, maxArrayLength: null, maxStringLength: null }),
    };
  if (seen.has(error)) return { type: error.name, message: "[Circular]" };
  seen.add(error);
  const rawCode = "code" in error ? error.code : undefined;
  return {
    type: error.name,
    message: error.message,
    ...(typeof rawCode === "string" ? { code: rawCode } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined ? { cause: safeError(error.cause, seen) } : {}),
  };
}
