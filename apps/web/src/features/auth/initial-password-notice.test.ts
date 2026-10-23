import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import { clearInitialPasswordNotice, showInitialPasswordNotice } from "./initial-password-notice";

vi.mock("@/lib/toast", () => ({ toast: { warning: vi.fn(), dismiss: vi.fn() } }));
beforeEach(() => {
  clearInitialPasswordNotice();
  vi.clearAllMocks();
});
describe("initial password notice", () => {
  it("warns once per credential session, has keyboard action and permits a later login", () => {
    const onChangePassword = vi.fn();
    const input = {
      sessionId: crypto.randomUUID(),
      initialPasswordUnchanged: true,
      onChangePassword,
    };
    showInitialPasswordNotice(input);
    showInitialPasswordNotice(input);
    expect(toast.warning).toHaveBeenCalledOnce();
    const options = vi.mocked(toast.warning).mock.calls[0]?.[1];
    expect(options).toMatchObject({ closeButton: true, action: { label: "修改密码" } });
    const action = options?.action;
    if (action && typeof action === "object" && "onClick" in action) action.onClick({} as never);
    expect(onChangePassword).toHaveBeenCalledOnce();
    showInitialPasswordNotice({ ...input, sessionId: crypto.randomUUID() });
    expect(toast.warning).toHaveBeenCalledTimes(2);
  });
  it("never warns after the initial state has been cleared", () => {
    showInitialPasswordNotice({
      sessionId: crypto.randomUUID(),
      initialPasswordUnchanged: false,
      onChangePassword: vi.fn(),
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
