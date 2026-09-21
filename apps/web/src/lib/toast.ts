import { toast as sonnerToast } from "sonner";
import { ApiError, apiErrorMessage, isSystemError } from "@/services/api-error";

const reportedErrors = new WeakSet<object>();

/** 普通文案直接展示；异常对象统一解析，同一对象只提示一次。 */
function showErrorToast(error: unknown, fallback?: string): void {
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
    : (fallback ?? (typeof error === "string" ? error : "操作失败，请稍后重试"));
  const id = sonnerToast.error(message, {
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
    sonnerToast.success("错误编号已复制", {
      id,
      description: requestId,
      action: undefined,
      duration: 4_000,
    });
  } catch {
    sonnerToast.error(message, {
      id,
      description: `复制失败，请手动复制：${requestId}`,
      action: undefined,
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
    });
  }
}

/** WEB 全局提示入口，共享 Toaster 的位置、主题和样式。 */
export const toast = {
  success: sonnerToast.success,
  error: showErrorToast,
  dismiss: sonnerToast.dismiss,
};
