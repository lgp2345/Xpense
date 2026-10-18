import type { RentalBillDetail, RentalPeriodBillContext } from "@xpense/shared";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

export type PeriodBillSurface = {
  surface?: "dialog" | "sheet";
  spaceLabel?: string;
  tenantNames?: string[];
};
export function PeriodBillFrame({
  onOpenChange,
  busy = false,
  surface = "dialog",
  spaceLabel,
  tenantNames,
  children,
}: {
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  children: ReactNode;
} & PeriodBillSurface) {
  const change = (open: boolean) => {
    if (!busy) onOpenChange(open);
  };
  if (surface === "sheet")
    return (
      <Sheet open onOpenChange={change}>
        <SheetContent className="w-full sm:max-w-3xl gap-0 p-0 overflow-hidden">
          <SheetHeader className="border-b py-4 px-5 shrink-0 pr-12 sm:px-6">
            <SheetTitle>生成下一张账单</SheetTitle>
            <SheetDescription>
              {spaceLabel} · {tenantNames?.join("、")}
            </SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
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
  props: PeriodBillDialogProps & { context: RentalPeriodBillContext } & PeriodBillSurface,
) {
  const session = usePeriodBillSession(props);
  return (
    <PeriodBillFrame {...props} busy={session.busy}>
      <PeriodBillEditor {...session} />
    </PeriodBillFrame>
  );
}
