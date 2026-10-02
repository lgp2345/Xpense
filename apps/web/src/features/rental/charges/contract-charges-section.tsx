import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { invalidateRentalFinance, rentalFinanceKeys } from "../../../services/rental-finance-query";
import { ContractChargesForm } from "./contract-charges-form";
import { MeterBaselineForm } from "./meter-baseline-form";

export function ContractChargesSection({
  organizationId,
  contractId,
  api,
  permissions,
  canEdit,
}: {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editCharges, setEditCharges] = useState(false);
  const [editBaseline, setEditBaseline] = useState(false);
  const canReadCharges = permissions.includes("rental_charges:read");
  const canReadMeters = permissions.includes("rental_meters:read");
  const canUpdateCharges = canEdit && permissions.includes("rental_charges:update");
  const canUpdateMeters = canEdit && permissions.includes("rental_meters:update");
  const terms = useQuery({
    queryKey: rentalFinanceKeys.chargeTerms(organizationId, contractId),
    queryFn: ({ signal }) => api.getChargeTerms(contractId, { signal }),
    enabled: Boolean(canReadCharges && organizationId && contractId),
  });
  const baseline = useQuery({
    queryKey: rentalFinanceKeys.meterBaseline(organizationId, contractId),
    queryFn: ({ signal }) => api.getMeterBaseline(contractId, { signal }),
    enabled: Boolean(canReadMeters && organizationId && contractId),
  });
  if (!canReadCharges && !canReadMeters) return null;
  const refresh = () => void invalidateRentalFinance(queryClient, organizationId, contractId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>月度收费与计量</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {canReadCharges ? (
          <section className="min-w-0 space-y-3" aria-labelledby="contract-charge-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="contract-charge-title" className="font-medium">
                合同收费标准
              </h2>
              {canUpdateCharges && terms.data ? (
                <Button variant="outline" size="sm" onClick={() => setEditCharges((open) => !open)}>
                  {editCharges ? "收起收费编辑" : "编辑收费标准"}
                </Button>
              ) : null}
            </div>
            {terms.isPending ? <p role="status">正在读取收费标准…</p> : null}
            {terms.isError ? (
              <div>
                <p role="alert">收费标准读取失败。</p>
                <Button variant="outline" onClick={() => void terms.refetch()}>
                  重试收费标准
                </Button>
              </div>
            ) : null}
            {terms.data ? (
              <div className="space-y-1 text-sm">
                <p className="tabular-nums">水费单价 CNY {terms.data.waterUnitPrice} / 立方米</p>
                <p className="tabular-nums">电费单价 CNY {terms.data.electricityUnitPrice} / 度</p>
                {terms.data.fixedFees.map((fee) => (
                  <p className="tabular-nums" key={fee.id}>
                    {fee.name} CNY {(fee.monthlyAmountMinor / 100).toFixed(2)} / 月
                  </p>
                ))}
                {terms.data.fixedFees.length === 0 ? (
                  <p className="text-muted-foreground">暂无固定月费。</p>
                ) : null}
              </div>
            ) : null}
            {canUpdateCharges && editCharges && terms.data ? (
              <ContractChargesForm
                organizationId={organizationId}
                contractId={contractId}
                api={api}
                terms={terms.data}
                onSaved={refresh}
              />
            ) : null}
          </section>
        ) : null}
        {canReadMeters ? (
          <section className="min-w-0 space-y-3" aria-labelledby="contract-meter-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="contract-meter-title" className="font-medium">
                入住计量底数
              </h2>
              {canUpdateMeters && baseline.data ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditBaseline((open) => !open)}
                >
                  {editBaseline ? "收起底数编辑" : "登记底数"}
                </Button>
              ) : null}
            </div>
            {baseline.isPending ? <p role="status">正在读取入住底数…</p> : null}
            {baseline.isError ? (
              <div>
                <p role="alert">入住底数读取失败。</p>
                <Button variant="outline" onClick={() => void baseline.refetch()}>
                  重试入住底数
                </Button>
              </div>
            ) : null}
            {baseline.data ? (
              <div className="space-y-1 text-sm tabular-nums">
                {(["water", "electricity"] as const).map((kind) => {
                  const reading = baseline.data.readings.find((item) => item.kind === kind);
                  return reading ? (
                    <p key={kind}>
                      入住{kind === "water" ? "水表" : "电表"}底数 {reading.reading} ·{" "}
                      {reading.readingDate.replaceAll("-", "/")}
                    </p>
                  ) : null;
                })}
                {baseline.data.readings.length === 0 ? (
                  <p className="text-muted-foreground">尚未登记入住底数。</p>
                ) : null}
              </div>
            ) : null}
            {canUpdateMeters && editBaseline && baseline.data ? (
              <MeterBaselineForm
                organizationId={organizationId}
                contractId={contractId}
                api={api}
                baseline={baseline.data}
                onSaved={refresh}
              />
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
