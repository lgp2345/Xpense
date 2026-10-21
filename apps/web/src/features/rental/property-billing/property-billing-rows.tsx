import type { RentalPropertyBillingCandidate } from "@xpense/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { billFinancialLabel } from "../bills/bill-cash-model";
import { formatBillAmount } from "../bills/bill-format";
import { BillingDistanceBadge } from "./billing-distance-badge";
import {
  displayBillingDayDistance,
  type PropertyBillingNode,
  propertyBillingIdentity,
} from "./property-billing-model";

/** 账单明细省略空间与租户信息，待出账行始终放在空间账单末尾。 */
export function PropertyBillingRows({
  node,
  today,
  onSelect,
  onNavigateBill,
  disabledReason,
}: {
  node: PropertyBillingNode;
  today: string;
  onSelect: (candidate: RentalPropertyBillingCandidate, trigger: HTMLButtonElement) => void;
  onNavigateBill: (billId: string) => void;
  disabledReason?: string;
}) {
  return node.rows.map((row) => {
    const bill = row.kind === "bill" ? row.unpaid.bill : null;
    return (
      <TableRow
        key={
          row.kind === "bill"
            ? `bill:${row.unpaid.bill.id}`
            : `candidate:${propertyBillingIdentity(row.candidate)}`
        }
      >
        <TableCell colSpan={2} />
        <TableCell className="align-top py-3">
          {bill ? (
            <Button
              variant="link"
              className="h-auto p-0 tabular-nums"
              onClick={() => onNavigateBill(bill.id)}
            >
              {bill.billNumber}
            </Button>
          ) : null}
        </TableCell>
        <TableCell className="align-top py-3 text-xs tabular-nums">
          {row.kind === "candidate" ? (
            <div className="space-y-1.5">
              <p>
                {row.candidate.period.periodStart} 至 {row.candidate.period.periodEnd}
              </p>
              <BillingDistanceBadge
                daysUntilStart={displayBillingDayDistance(today, row.candidate.period.periodStart)}
              />
            </div>
          ) : bill?.type === "deposit" ? (
            "押金"
          ) : (
            `${bill?.periodStart} 至 ${bill?.periodEnd}`
          )}
        </TableCell>
        <TableCell className="align-top py-3 text-right tabular-nums">
          {bill ? (
            formatBillAmount(bill.amountMinor, bill.currencyCode)
          ) : (
            <span className="text-muted-foreground">待计算</span>
          )}
        </TableCell>
        <TableCell className="align-top py-3">
          <Badge variant="outline">{bill ? billFinancialLabel(bill) : "待出账"}</Badge>
        </TableCell>
        <TableCell className="align-top py-3">
          {row.kind === "candidate" ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(disabledReason)}
                    focusableWhenDisabled
                    data-billing-contract={row.candidate.contractId}
                    aria-label={`生成账单 ${node.space.name} ${row.candidate.tenantNames.join("、")}`}
                    onClick={(event) => onSelect(row.candidate, event.currentTarget)}
                  >
                    生成账单
                  </Button>
                }
              />
              {disabledReason ? (
                <TooltipContent sideOffset={4}>{disabledReason}</TooltipContent>
              ) : null}
            </Tooltip>
          ) : null}
        </TableCell>
      </TableRow>
    );
  });
}
