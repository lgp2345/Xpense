import type { RentalContractSummary } from "@xpense/shared";
import { ChevronRight, MapPin } from "lucide-react";
import { formatContractDateTime } from "../contracts/contract-date-time";
import { ContractStatusBadge } from "../contracts/contract-status";

/** 房产与空间侧栏共用的合同摘要，归属空间始终在合同编号下展示。 */
export function PropertyContractList({
  items,
  onNavigateContract,
  compact = false,
}: {
  items: RentalContractSummary[];
  onNavigateContract?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      {!compact ? (
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1.2fr)_auto] gap-5 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid"
        >
          <span>合同 / 归属空间</span>
          <span>承租人</span>
          <span>租期</span>
          <span className="pr-7">状态</span>
        </div>
      ) : null}
      <div className="divide-y">
        {items.map((contract) => (
          <a
            key={contract.id}
            href={`/rentals/contracts/${contract.id}`}
            className={`group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-md px-3 py-4 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 ${compact ? "" : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1.2fr)_auto] sm:items-center sm:gap-x-5"}`}
            onClick={(event) => {
              if (
                !onNavigateContract ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onNavigateContract(contract.id);
            }}
          >
            <div className="col-start-1 row-start-1 min-w-0 space-y-1.5">
              <p className="break-all font-medium tabular-nums">{contract.contractNumber}</p>
              <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="sr-only">归属空间：</span>
                <span className="break-words">
                  {contract.spaceNames.join("、") || "未关联空间"}
                </span>
              </div>
            </div>
            <p
              className={`col-start-1 min-w-0 break-words ${compact ? "" : "sm:col-start-2 sm:row-start-1"}`}
            >
              <span className={`text-xs text-muted-foreground ${compact ? "" : "sm:hidden"}`}>
                承租人：
              </span>
              {contract.tenantNames.join("、") || "未指定承租方"}
            </p>
            <div
              className={`col-start-1 min-w-0 text-xs leading-relaxed text-muted-foreground tabular-nums ${compact ? "" : "sm:col-start-3 sm:row-start-1"}`}
            >
              <p className="break-words">
                {formatContractDateTime(contract.startDate) ?? "未约定开始时间"}
              </p>
              <p className="break-words">
                至{" "}
                {formatContractDateTime(contract.actualEndDate ?? contract.endDate) ??
                  "未约定结束时间"}
              </p>
            </div>
            <div
              className={`col-start-2 row-start-1 flex items-center gap-2 ${compact ? "" : "sm:col-start-4"}`}
            >
              <ContractStatusBadge status={contract.displayStatus} />
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
              />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
