import type { RentalBillDetail, RentalPeriodBillContext } from "@xpense/shared";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { PeriodBillEditor } from "./period-bill-editor";
import { usePeriodBillSession } from "./use-period-bill-session";
export type PeriodBillDialogProps = {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (bill: RentalBillDetail) => void;
};

export function PeriodBillFrame({
  onOpenChange,
  busy = false,
  children,
}: {
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const change = (open: boolean) => {
    if (!busy) onOpenChange(open);
  };
  return (
    <Dialog open onOpenChange={change}>
      <DialogContent className="flex flex-col max-h-[92dvh] p-0 gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="border-b py-4 px-5 shrink-0 sm:px-6">
          <DialogTitle>生成下一张账单</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function PeriodBillSession(
  props: PeriodBillDialogProps & { context: RentalPeriodBillContext },
) {
  const session = usePeriodBillSession(props);
  return (
    <PeriodBillFrame {...props} busy={session.busy}>
      <PeriodBillEditor {...session} />
    </PeriodBillFrame>
  );
}
