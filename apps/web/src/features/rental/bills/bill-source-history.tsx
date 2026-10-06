import type { UseNavigateResult } from "@tanstack/react-router";
import type { RentalBillDetail } from "@xpense/shared";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BillTable } from "./bill-table";

export function BillSourceHistory({
  bill,
  navigate,
}: {
  bill: RentalBillDetail;
  navigate?: UseNavigateResult<"/rentals/bills/$billId">;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <CardTitle className="text-base leading-6">
          <h2>统一计费项的历史账单</h2>
        </CardTitle>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="历史账单说明"
            >
              <CircleHelp aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72 leading-relaxed" sideOffset={4}>
            展示同一合同、同一计费项产生的其他账单，用于追溯作废后重新生成等历史。
            例如同一个押金项目，或同一个计费月份。最多展示最近 20 张，不含当前账单和收退款记录。
          </TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground">最近 20 张</span>
      </CardHeader>
      <CardContent className="text-sm">
        {bill.history.length ? (
          <BillTable
            items={bill.history}
            onNavigate={(id) => {
              if (navigate) {
                void navigate({ to: "/rentals/bills/$billId", params: { billId: id } });
              } else {
                window.location.href = `/rentals/bills/${encodeURIComponent(id)}`;
              }
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">暂无其他历史账单。</p>
        )}
      </CardContent>
    </Card>
  );
}
