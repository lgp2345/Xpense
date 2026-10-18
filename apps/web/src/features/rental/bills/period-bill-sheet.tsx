import { useQuery } from "@tanstack/react-query";
import type { RentalPeriodBillContext } from "@xpense/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "../../../services/api-client";
import { rentalFinanceKeys } from "../../../services/rental-finance-query";
import {
  type PeriodBillDialogProps,
  PeriodBillFrame,
  PeriodBillSession,
} from "./period-bill-session";
export type PeriodBillSheetProps = PeriodBillDialogProps & {
  spaceLabel: string;
  tenantNames: string[];
  expectedPeriodStart: string;
};
export function PeriodBillSheet(props: PeriodBillSheetProps) {
  return props.open ? (
    <SheetLoader key={`${props.organizationId}:${props.contractId}`} {...props} />
  ) : null;
}
function SheetLoader(props: PeriodBillSheetProps) {
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
  if (snapshot?.nextPeriod && snapshot.nextPeriod.periodStart === props.expectedPeriodStart)
    return <PeriodBillSession {...props} surface="sheet" context={snapshot} />;
  return (
    <PeriodBillFrame {...props} surface="sheet">
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
          <p role="alert">待出账账期已变化，请刷新列表</p>
        ) : (
          <p>合同账期已全部生成。</p>
        )}
        <Button variant="outline" onClick={() => props.onOpenChange(false)}>
          关闭
        </Button>
      </div>
    </PeriodBillFrame>
  );
}
