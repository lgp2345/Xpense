import { useQuery } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import type { ReactNode } from "react";
import {
  SecondaryPageLayout,
  type SecondaryPageNavigation,
} from "@/components/layout/secondary-page-layout";
import { Button } from "@/components/ui/button";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { rentalFinanceKeys } from "../../../services/rental-finance-query";
import { formatBillAmount } from "../bills/bill-format";
import { SettlementCashActions } from "./settlement-cash-actions";
import { SettlementEditor } from "./settlement-editor";
import { SettlementHistory } from "./settlement-history";
import { SettlementMoneySummary } from "./settlement-money-actions";

export function SettlementPage({
  organizationId,
  contractId,
  permissions,
  api,
  onBack,
  breadcrumbs = [
    { key: "contracts", label: "合同管理" },
    { key: "contract", label: "合同详情" },
    { key: "settlement", label: "退租结算" },
  ],
}: SecondaryPageNavigation & {
  organizationId: string;
  contractId: string;
  permissions: readonly PermissionKey[];
  api: RentalFinanceApi;
}) {
  const canRead = permissions.includes("rental_settlements:read");
  const settlementQuery = useQuery({
    queryKey: rentalFinanceKeys.settlement(organizationId, contractId),
    queryFn: ({ signal }) => api.getSettlement(contractId, { signal }),
    enabled: Boolean(canRead && organizationId && contractId),
  });

  const renderPage = (children: ReactNode) => (
    <SecondaryPageLayout
      breadcrumbs={breadcrumbs}
      title="退租结算"
      description="结算确认与实际收退款分别登记；最终金额由服务端预览。"
      onBack={onBack}
    >
      {children}
    </SecondaryPageLayout>
  );
  if (!canRead)
    return renderPage(
      <main>
        <p>你没有查看退租结算的权限。</p>
      </main>,
    );
  if (settlementQuery.isPending) return renderPage(<main role="status">正在读取退租结算…</main>);
  if (settlementQuery.isError)
    return renderPage(
      <main className="space-y-3">
        <p role="alert">退租结算读取失败。</p>
        <Button variant="outline" onClick={() => void settlementQuery.refetch()}>
          重试
        </Button>
      </main>,
    );

  const settlement = settlementQuery.data.settlement;
  return renderPage(
    <main className="max-w-5xl space-y-5">
      {settlement ? (
        <>
          <section className="space-y-2 rounded-lg border p-4" aria-label="最终费用">
            <h2 className="font-semibold">费用明细</h2>
            <p className="text-sm">最终结算费用 {formatBillAmount(settlement.finalCostMinor)}</p>
            <p className="text-xs text-muted-foreground">月度费用及更正记录可在合同账单中查看。</p>
            <a
              className="text-sm underline"
              href={`/rentals/bills?contractId=${encodeURIComponent(contractId)}`}
            >
              查看合同账单与更正
            </a>
          </section>
          <SettlementMoneySummary settlement={settlement} />
          <SettlementCashActions
            key={`${organizationId}:${contractId}:${settlement.id}`}
            organizationId={organizationId}
            settlement={settlement}
            api={api}
            permissions={permissions}
          />
        </>
      ) : (
        <SettlementEditor
          key={`${organizationId}:${contractId}`}
          organizationId={organizationId}
          contractId={contractId}
          permissions={permissions}
          api={api}
        />
      )}
      <SettlementHistory organizationId={organizationId} contractId={contractId} api={api} />
    </main>,
  );
}
