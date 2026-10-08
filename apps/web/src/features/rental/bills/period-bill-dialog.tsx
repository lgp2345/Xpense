import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "../../../services/api-client";
import { rentalFinanceKeys } from "../../../services/rental-finance-query";
import { PeriodBillSession, type PeriodBillDialogProps as Props } from "./period-bill-session";
export function PeriodBillDialog(props: Props) {
  return props.open ? (
    <PeriodBillLoader key={`${props.organizationId}:${props.contractId}`} {...props} />
  ) : null;
}
function PeriodBillLoader(props: Props) {
  const context = useQuery({
    queryKey: rentalFinanceKeys.periodBillContext(props.organizationId, props.contractId),
    queryFn: ({ signal }) =>
      props.api.getPeriodBillContext({ contractId: props.contractId }, { signal }),
    retry: false,
  });
  if (context.data?.nextPeriod) return <PeriodBillSession {...props} context={context.data} />;
  return (
    <Dialog open onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>生成下一张账单</DialogTitle>
          <DialogDescription>按合同账期生成普通账单。</DialogDescription>
        </DialogHeader>
        {context.isPending ? (
          <p role="status">正在读取下一账期…</p>
        ) : context.isError ? (
          <div className="space-y-2">
            <p role="alert">
              {context.error instanceof ApiError && context.error.status === 403
                ? "缺少账期出账权限。"
                : "下一账期读取失败，请重试。"}
            </p>
            <Button variant="outline" onClick={() => void context.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <p>合同账期已全部生成。</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
