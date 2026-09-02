import type { PermissionKey, RentalContractDetail, RentalContractParty } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { createEphemeralRentalReveal } from "../../../services/rental-query";

export function ContractPartySection({
  api,
  contract,
  permissions,
}: {
  api: RentalApi;
  contract: RentalContractDetail;
  permissions: readonly PermissionKey[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">承租方</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {contract.parties.map((party) => (
          <PartyRow
            key={`${party.tenantId}:${party.validFrom ?? "current"}`}
            api={api}
            contract={contract}
            party={party}
            permissions={permissions}
          />
        ))}
      </div>
    </section>
  );
}

function PartyRow({
  api,
  contract,
  party,
  permissions,
}: {
  api: RentalApi;
  contract: RentalContractDetail;
  party: RentalContractParty;
  permissions: readonly PermissionKey[];
}) {
  const canReveal =
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_tenants:sensitive_read") &&
    party.validFrom !== null &&
    party.validTo !== null;
  const reveal = useRef(
    createEphemeralRentalReveal<
      Awaited<ReturnType<NonNullable<RentalApi["revealContractPartySensitive"]>>>
    >(),
  ).current;
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<Awaited<
    ReturnType<NonNullable<RentalApi["revealContractPartySensitive"]>>
  > | null>(null);
  useEffect(() => {
    if (!canReveal) {
      generation.current += 1;
      reveal.close();
      setLoading(false);
      setError(null);
      setValue(null);
    }
  }, [canReveal, reveal]);
  useEffect(
    () => () => {
      generation.current += 1;
      reveal.unmount();
    },
    [reveal],
  );
  const revealSensitive = async () => {
    if (!canReveal || !party.validFrom || !api.revealContractPartySensitive) return;
    const current = generation.current + 1;
    generation.current = current;
    reveal.reopen();
    setLoading(true);
    setError(null);
    setValue(null);
    try {
      const result = await reveal.reveal(
        (signal) =>
          api.revealContractPartySensitive?.(
            {
              contractId: contract.id,
              tenantId: party.tenantId,
              validFrom: party.validFrom as string,
            },
            { signal },
          ) ?? Promise.reject(new Error("敏感信息查看不可用")),
      );
      if (generation.current === current && result) setValue(result);
    } catch (cause) {
      if (generation.current === current)
        setError(
          cause instanceof ApiError && cause.status === 403
            ? "你没有查看该身份信息的权限。"
            : "身份信息查看失败，请稍后重试。",
        );
    } finally {
      if (generation.current === current) setLoading(false);
    }
  };
  const close = () => {
    generation.current += 1;
    reveal.close();
    setLoading(false);
    setError(null);
    setValue(null);
  };
  const documentNumber = canReveal
    ? (value?.documentNumber ?? party.maskedDocumentNumber)
    : party.maskedDocumentNumber;
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{party.name}</span>
          {party.isPrimaryPayer ? <Badge variant="outline">主付款人</Badge> : null}
          {party.validTo !== null ? <Badge variant="secondary">历史</Badge> : null}
        </div>
        <p>
          有效期：{party.validFrom ?? "合同开始"} 至 {party.validTo ?? "当前"}
        </p>
        <p>
          证件号：<span>{documentNumber}</span>
        </p>
        {canReveal ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void revealSensitive()}>
              {loading ? "重新查看" : "查看完整身份"}
            </Button>
            {loading || value ? (
              <Button variant="ghost" onClick={close}>
                {loading ? "取消查看" : "关闭"}
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
