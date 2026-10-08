import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { billFixture, financeApiFixture } from "./bill-test-fixtures";
import { BillVoidDialog } from "./bill-void-dialog";
it("二次确认说明回退与资金限制，带版本及原因作废", async () => {
  const api = financeApiFixture();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillVoidDialog
        organizationId="org"
        bill={billFixture}
        api={api}
        open
        onOpenChange={vi.fn()}
        onVoided={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/水电基准回退/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认作废" }));
  expect(screen.getByText("请填写作废原因。")).toBeInTheDocument();
  expect(api.voidPeriodBill).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("作废原因"), "核对读数后重开");
  await userEvent.click(screen.getByRole("button", { name: "确认作废" }));
  await waitFor(() =>
    expect(api.voidPeriodBill).toHaveBeenCalledWith(
      expect.objectContaining({
        billId: billFixture.id,
        expectedVersion: "bill-v1",
        reason: "核对读数后重开",
      }),
    ),
  );
});
