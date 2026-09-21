import type { RentalContractDetail } from "@xpense/shared";
import { Building2, History, type LucideIcon, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "./contract-table";

export function Overview({ contract }: { contract: RentalContractDetail }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardContent className="p-0">
        <div className="grid bg-muted/30 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-2 border-b p-5 md:border-r md:border-b-0">
            <p className="text-sm text-muted-foreground">租金</p>
            <p className="break-words text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(contract.rentAmountMinor)}
            </p>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Info
              label="合同期"
              value={`${contract.startDate ?? "未开始"} 至 ${contract.endDate ?? "未结束"}`}
            />
            <Info label="实际结束日" value={contract.actualEndDate ?? "未结束"} />
          </div>
        </div>
        <div className="grid gap-x-6 gap-y-5 border-t p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info
            label="计费锚点"
            value={
              contract.billingAnchor === "contract_start"
                ? "合同起始日"
                : contract.billingAnchor === "calendar_month"
                  ? "自然月"
                  : "未设置"
            }
          />
          <Info
            label="付款周期"
            value={
              contract.paymentIntervalMonths
                ? `每 ${contract.paymentIntervalMonths} 个月`
                : "未设置"
            }
          />
          <Info
            label="提前几天到期"
            value={contract.dueDaysBefore === null ? "未设置" : `${contract.dueDaysBefore} 天`}
          />
          <Info label="续租来源" value={contract.renewedFromContractId ?? "无"} />
          {contract.note ? (
            <div className="min-w-0 border-t pt-4 sm:col-span-2 lg:col-span-4">
              <span className="text-muted-foreground">备注</span>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                {contract.note}
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
export function SpaceSection({ contract }: { contract: RentalContractDetail }) {
  return (
    <Section title="空间快照" icon={Building2}>
      {contract.spaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">未指定空间。</p>
      ) : (
        <div className="divide-y">
          {contract.spaces.map((space) => (
            <div
              key={space.spaceId}
              className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="break-words font-medium">
                  {space.spacePath.map((node) => node.name).join(" / ")}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  空间：{space.spaceName}
                  {space.spaceCode ? `（${space.spaceCode}）` : ""}
                </p>
              </div>
              <div className="min-w-0 text-sm sm:text-right">
                <p className="text-xs text-muted-foreground">租金分摊</p>
                <p className="mt-1 break-words font-medium tabular-nums">
                  {formatMoney(space.rentAllocationMinor)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
export function DepositSection({ contract }: { contract: RentalContractDetail }) {
  return (
    <Section title="押金" icon={WalletCards}>
      <div className="divide-y">
        {contract.depositTerms.length === 0 ? (
          <p className="text-sm text-muted-foreground">未设置押金。</p>
        ) : (
          contract.depositTerms.map((term) => (
            <div
              key={term.id}
              className="grid items-start gap-4 py-4 text-sm first:pt-0 last:pb-0 sm:grid-cols-2 xl:grid-cols-4"
            >
              <p className="min-w-0 break-words font-medium">
                {term.customName ?? depositLabel(term.type)}
              </p>
              <Info
                label="计算方式"
                value={term.calculationMode === "fixed_amount" ? "固定金额" : "租金倍数"}
              />
              <Info
                label="约定值"
                value={
                  term.calculationMode === "fixed_amount"
                    ? formatMoney(term.fixedAmountMinor)
                    : `${term.rentMultiple ?? "未设置"} 倍租金`
                }
              />
              <div className="min-w-0 xl:text-right">
                <p className="text-xs text-muted-foreground">最终金额</p>
                <p className="mt-2 break-words text-xl font-semibold tracking-tight tabular-nums">
                  {formatMoney(term.finalAmountMinor)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Section>
  );
}
export function LifecycleSection({ contract }: { contract: RentalContractDetail }) {
  return (
    <Section title="生命周期" icon={History}>
      <div className="grid gap-5 text-sm sm:grid-cols-3">
        <Info label="取消原因" value={contract.cancellationReason ?? "无"} />
        <Info label="终止日期" value={contract.terminationDate ?? "无"} />
        <Info label="终止原因" value={contract.terminationReason ?? "无"} />
      </div>
    </Section>
  );
}
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 p-5 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-8 lg:p-6">
      <div className="flex items-center gap-2 self-start lg:pt-1">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <dl className="min-w-0 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 break-words font-medium leading-relaxed tabular-nums">{value}</dd>
    </dl>
  );
}
function depositLabel(type: string): string {
  return (
    (
      {
        rental: "租金押金",
        utility: "水电押金",
        access_card: "门禁卡押金",
        other: "其他押金",
      } as Record<string, string>
    )[type] ?? "押金"
  );
}
