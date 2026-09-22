import type { RentalPropertyDetail } from "@xpense/shared";
import { Card, CardContent } from "@/components/ui/card";

export function PropertyOverview({ property }: { property: RentalPropertyDetail }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardContent className="p-0">
        <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid grid-cols-2 gap-5 border-b bg-muted/30 p-5 md:border-r md:border-b-0 lg:p-6">
            <Metric label="空间总数" value={property.spaceCount} prominent />
            <Metric label="可出租空间" value={property.rentableSpaceCount} prominent />
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-3 lg:p-6">
            <Metric label="生效中合同" value={property.activeContractCount} />
            <Metric label="即将生效合同" value={property.upcomingContractCount} />
            <Metric label="即将到期合同" value={property.expiringSoonContractCount} />
          </div>
        </div>
        {property.note ? (
          <div className="grid gap-2 border-t p-5 text-sm lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-8 lg:px-6">
            <span className="text-muted-foreground">备注</span>
            <p className="min-w-0 whitespace-pre-wrap break-words leading-relaxed">
              {property.note}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  prominent = false,
}: {
  label: string;
  value: number;
  prominent?: boolean;
}) {
  return (
    <dl className="min-w-0 space-y-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`break-words font-semibold tracking-tight tabular-nums ${prominent ? "text-3xl" : "text-2xl"}`}
      >
        {value}
      </dd>
    </dl>
  );
}
