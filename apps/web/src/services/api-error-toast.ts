import { toast } from "sonner";
import { ApiError, apiErrorMessage, isSystemError } from "./api-error";

const reportedErrors = new WeakSet<object>();

/** 同一错误只提示一次，页面已有的业务提示可复用此入口。 */
export function showApiErrorToast(error: unknown, fallback = "操作失败，请稍后重试"): void {
  if (error !== null && typeof error === "object") {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }
  const apiError = error instanceof ApiError ? error : undefined;
  const system = apiError && isSystemError(apiError);
  const requestId = system && apiError.status !== 0 ? apiError.requestId : undefined;
  const message = apiError
    ? apiErrorMessage(
        apiError.status,
        apiError.code,
        system ? "服务暂时异常，请稍后重试" : apiError.message,
      )
    : fallback;
  const id = toast.error(message, {
    duration: system ? 15_000 : 6_000,
    closeButton: true,
    ...(requestId
      ? {
          description: `错误编号：${requestId}`,
          action: {
            label: "复制错误编号",
            onClick: (event) => {
              event.preventDefault();
              void copyRequestId(requestId, id, message);
            },
          },
        }
      : {}),
  });
}

async function copyRequestId(
  requestId: string,
  id: string | number,
  message: string,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(requestId);
    toast.success("错误编号已复制", {
      id,
      description: requestId,
      action: undefined,
      duration: 4_000,
    });
  } catch {
    toast.error(message, {
      id,
      description: `复制失败，请手动复制：${requestId}`,
      action: undefined,
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
    });
  }
}
