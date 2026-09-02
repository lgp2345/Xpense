import type { RentalContractSummary } from "@xpense/shared";

import { Card, CardContent } from "@/components/ui/card";
import { ContractStatusBadge } from "./contract-status";
import { ContractLink, formatMoney } from "./contract-table";

export function ContractCards({
  items,
  onNavigate,
}: {
  items: RentalContractSummary[];
  onNavigate: (contractId: string) => void;
}) {
  return (
    <div data-testid="contract-cards" className="grid gap-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="grid gap-2 p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <ContractLink item={item} onNavigate={onNavigate} />
              <ContractStatusBadge status={item.displayStatus} />
            </div>
            <p>
              {item.propertyName} · {item.spaceNames.join("、") || "未指定空间"}
            </p>
            <p className="text-muted-foreground">
              {item.startDate ?? "未开始"} 至 {item.endDate ?? "未结束"}
            </p>
            <p>租金：{formatMoney(item.rentAmountMinor)}</p>
            <p>承租方：{item.tenantNames.join("、") || "未指定承租方"}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
