import { Badge } from "@/components/ui/badge";
export function BillingDistanceBadge({ daysUntilStart: days }: { daysUntilStart: number }) {
  const variant = Math.abs(days) >= 15 ? "destructive" : "secondary";
  return (
    <Badge variant={variant} data-variant={variant}>
      {days === 0 ? "今天" : days > 0 ? `还有 ${days} 天` : `已过 ${Math.abs(days)} 天`}
    </Badge>
  );
}
