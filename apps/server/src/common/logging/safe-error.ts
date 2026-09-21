const errorTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AggregateError",
  "DrizzleQueryError",
  "PostgresError",
  "HttpException",
  "InternalServerErrorException",
  "ServiceUnavailableException",
  "GatewayTimeoutException",
]);
const errorMessages: Record<string, string> = {
  ECONNREFUSED: "依赖连接被拒绝",
  ETIMEDOUT: "依赖连接超时",
  ENOTFOUND: "依赖地址解析失败",
  ECONNRESET: "依赖连接被重置",
  "23505": "数据库唯一约束冲突",
  "23503": "数据库关联约束冲突",
  "23502": "数据库必填字段缺失",
  "23514": "数据库检查约束失败",
  "40001": "数据库事务冲突",
  "40P01": "数据库死锁",
  "53300": "数据库连接数已达上限",
  "57P01": "数据库服务已关闭",
  "08006": "数据库连接失败",
  "28P01": "数据库认证失败",
};

export type SafeError = {
  type: string;
  message: string;
  code?: string;
  stack?: string;
  cause?: SafeError;
};

/** 不输出异常自由文本、SQL 或参数；仅保留已知原因与调用位置。 */
export function safeError(error: unknown, depth = 0): SafeError {
  if (!(error instanceof Error)) return { type: "UnknownError", message: "抛出了非 Error 异常" };
  const rawCode = "code" in error ? error.code : undefined;
  const code =
    typeof rawCode === "string" && Object.hasOwn(errorMessages, rawCode) ? rawCode : undefined;
  // 堆栈首行和函数名也可能携带异常文本，只收集独立的位置后缀。
  const stack = error.stack
    ?.split("\n")
    .slice(1)
    .flatMap((line) => {
      if (!/^\s+at /.test(line)) return [];
      const location = line.match(/(?:\(|\s)((?:file:\/\/\/|\/|node:)[^\s()?]+:\d+:\d+)\)?$/)?.[1];
      return location ? [location.replace(process.cwd(), ".")] : [];
    })
    .slice(0, 20)
    .join("\n");
  return {
    type: errorTypes.has(error.name) ? error.name : "Error",
    message: (code ? errorMessages[code] : undefined) ?? "执行失败，请结合错误类型和调用位置排查",
    ...(code ? { code } : {}),
    ...(stack ? { stack } : {}),
    ...(error.cause !== undefined && depth < 2 ? { cause: safeError(error.cause, depth + 1) } : {}),
  };
}
