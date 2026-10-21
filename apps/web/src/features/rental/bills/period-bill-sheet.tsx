import { useQuery } from "@tanstack/react-query";
import type { RentalPeriodBillContext } from "@xpense/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError } from "../../../services/api-client";
import { rentalFinanceKeys } from "../../../services/rental-finance-query";
import { PeriodBillEditor } from "./period-bill-editor";
import type { PeriodBillDialogProps } from "./period-bill-session";
import { usePeriodBillSession } from "./use-period-bill-session";
export type PeriodBillSheetProps = PeriodBillDialogProps & {
  spaceLabel: string;
  tenantNames: string[];
  expectedPeriodStart: string;
  onContextChanged?: () => void;
};
export function PeriodBillSheet(props: PeriodBillSheetProps) {
  return props.open ? (
    <SheetLoader key={`${props.organizationId}:${props.contractId}`} {...props} />
  ) : null;
}
function SheetLoader(props: PeriodBillSheetProps) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<RentalPeriodBillContext | null>(null);
  const context = useQuery({
    queryKey: rentalFinanceKeys.periodBillContext(props.organizationId, props.contractId),
    queryFn: ({ signal }) =>
      props.api.getPeriodBillContext({ contractId: props.contractId }, { signal }),
    retry: false,
    staleTime: 0,
    enabled: snapshot === null,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (
      context.isFetchedAfterMount &&
      context.isSuccess &&
      !context.isFetching &&
      context.data &&
      !snapshot
    )
      setSnapshot(context.data);
  }, [context.isFetchedAfterMount, context.isSuccess, context.isFetching, context.data, snapshot]);
  const changed = Boolean(
    snapshot && snapshot.nextPeriod?.periodStart !== props.expectedPeriodStart,
  );
  const onContextChanged = props.onContextChanged;
  useEffect(() => {
    if (changed) onContextChanged?.();
  }, [changed, onContextChanged]);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) props.onOpenChange(false);
      }}
    >
      <SheetContent className="w-full sm:max-w-3xl gap-0 p-0 overflow-hidden">
        <SheetHeader className="border-b py-4 px-5 shrink-0 pr-12 sm:px-6">
          <SheetTitle>生成下一张账单</SheetTitle>
          <SheetDescription>
            {props.spaceLabel} · {props.tenantNames.join("、")}
          </SheetDescription>
        </SheetHeader>
        {snapshot?.nextPeriod && snapshot.nextPeriod.periodStart === props.expectedPeriodStart ? (
          <SheetSession
            {...props}
            context={snapshot}
            onOpenChange={setOpen}
            onBusyChange={setBusy}
          />
        ) : (
          <div className="p-5 space-y-4">
            {context.isPending || !context.isFetchedAfterMount ? (
              <p role="status">正在读取下一账期…</p>
            ) : context.isError ? (
              <>
                <p role="alert">
                  {context.error instanceof ApiError && context.error.status === 403
                    ? "缺少账期出账权限。"
                    : "下一账期读取失败，请重试。"}
                </p>
                <Button variant="outline" onClick={() => void context.refetch()}>
                  重试
                </Button>
              </>
            ) : context.data?.nextPeriod ? (
              <p role="alert">待出账账期已变化，关闭窗口后可查看最新账期。</p>
            ) : (
              <p>合同账期已全部生成。</p>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
function SheetSession({
  onBusyChange,
  ...props
}: PeriodBillSheetProps & {
  context: RentalPeriodBillContext;
  onBusyChange: (busy: boolean) => void;
}) {
  const session = usePeriodBillSession(props);
  useEffect(() => onBusyChange(session.busy), [onBusyChange, session.busy]);
  return <PeriodBillEditor {...session} />;
}
