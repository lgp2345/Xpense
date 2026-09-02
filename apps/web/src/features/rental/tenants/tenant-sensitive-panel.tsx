import type { PermissionKey, RentalTenantSensitiveDetail } from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RentalApi } from "../../../services/rental-api";

export function TenantSensitivePanel({
  api,
  organizationId,
  tenantId,
  maskedDocumentNumber,
  permissions,
}: {
  api: RentalApi;
  organizationId: string;
  tenantId: string;
  maskedDocumentNumber: string | null;
  permissions: readonly PermissionKey[];
}) {
  const canReveal =
    permissions.includes("rental_tenants:read") &&
    permissions.includes("rental_tenants:sensitive_read");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [sensitive, setSensitive] = useState<RentalTenantSensitiveDetail | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const contextKey = `${organizationId}:${tenantId}`;
  const contextRef = useRef(contextKey);
  const isCurrentContext = contextRef.current === contextKey;

  const invalidate = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    generationRef.current += 1;
    setSensitive(null);
    setStatus("idle");
    setOpen(false);
  }, []);

  useEffect(() => {
    contextRef.current = contextKey;
    invalidate();
    return () => {
      invalidate();
    };
  }, [contextKey, invalidate]);

  useEffect(() => {
    if (!canReveal) invalidate();
  }, [canReveal, invalidate]);

  if (!canReveal || !isCurrentContext) return <IdentityMaskedValue value={maskedDocumentNumber} />;

  async function reveal() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    setOpen(true);
    setSensitive(null);
    setStatus("loading");
    try {
      const result = await api.revealTenantSensitive?.(
        { id: tenantId },
        { signal: controller.signal },
      );
      if (
        controller.signal.aborted ||
        generation !== generationRef.current ||
        contextRef.current !== contextKey ||
        !result
      )
        return;
      setSensitive(result);
      setStatus("success");
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setStatus("error");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return (
    <section aria-label="身份信息" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">证件号</span>
        <IdentityMaskedValue value={maskedDocumentNumber} />
        {open ? (
          <Button variant="outline" size="sm" onClick={invalidate}>
            关闭完整信息
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void reveal()}>
            查看完整身份信息
          </Button>
        )}
      </div>
      {open ? (
        <Card>
          <CardContent className="grid gap-2 p-4 text-sm" aria-live="polite">
            {status === "loading" ? (
              <p>正在读取完整身份信息...</p>
            ) : status === "error" ? (
              <p role="alert">暂时无法读取完整身份信息，请稍后重试。</p>
            ) : status === "success" && sensitive ? (
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">证件号码</dt>
                  <dd>{sensitive.documentNumber ?? "未填写"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">出生日期</dt>
                  <dd>{sensitive.birthDate ?? "未填写"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">性别</dt>
                  <dd>{sensitive.gender ?? "未填写"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">民族</dt>
                  <dd>{sensitive.ethnicity ?? "未填写"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">证件地址</dt>
                  <dd>{sensitive.documentAddress ?? "未填写"}</dd>
                </div>
              </dl>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function IdentityMaskedValue({ value }: { value: string | null }) {
  return <span>{value ?? "未填写"}</span>;
}
