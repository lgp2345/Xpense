import { toast } from "@/lib/toast";

/** 兼容旧入口，新调用统一使用 @/lib/toast。 */
export function showApiErrorToast(error: unknown, fallback = "操作失败，请稍后重试"): void {
  toast.error(error, fallback);
}
