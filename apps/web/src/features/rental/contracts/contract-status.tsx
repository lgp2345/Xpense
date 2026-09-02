import type { RentalContractDisplayStatus } from "@xpense/shared";

import { Badge } from "@/components/ui/badge";

export const CONTRACT_STATUS_LABELS: Record<RentalContractDisplayStatus, string> = {
  draft: "草稿",
  upcoming: "待生效",
  active: "进行中",
  expiring_soon: "即将到期",
  expired: "已到期",
  cancelled: "已取消",
  terminated: "已终止",
};

export function ContractStatusBadge({ status }: { status: RentalContractDisplayStatus }) {
  return (
    <Badge variant={status === "active" ? "default" : "secondary"}>
      {CONTRACT_STATUS_LABELS[status]}
    </Badge>
  );
}
