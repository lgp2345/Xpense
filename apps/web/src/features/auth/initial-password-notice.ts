import { toast } from "@/lib/toast";

// 仅记住本页生命周期内的登录会话；不写入持久化已读状态。
let lastSessionId: string | undefined;
const noticeId = "initial-password-notice";
export function showInitialPasswordNotice(input: {
  sessionId: string;
  initialPasswordUnchanged: boolean;
  onChangePassword: () => void;
}): void {
  if (!input.initialPasswordUnchanged || lastSessionId === input.sessionId) return;
  lastSessionId = input.sessionId;
  toast.warning("您尚未修改初始密码，请及时修改。", {
    id: noticeId,
    closeButton: true,
    duration: 10000,
    action: { label: "修改密码", onClick: input.onChangePassword },
  });
}
export function clearInitialPasswordNotice(): void {
  toast.dismiss(noticeId);
}
