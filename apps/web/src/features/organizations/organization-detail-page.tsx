import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useStore } from "zustand";
import { SecondaryPageLayout } from "@/components/layout/secondary-page-layout";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { organizationsQueryOptions } from "@/services/organizations-query";
import { switchWebOrganization, type WebSessionDependency } from "@/services/web-session";
import { OrganizationActions } from "./organization-columns";

export function OrganizationDetailPage({
  session,
  organizationId,
  onBack,
  onEntered,
  onManageOwners,
}: {
  session: WebSessionDependency;
  organizationId: string;
  onBack: () => void;
  onEntered: () => void;
  onManageOwners?: () => void;
}) {
  const userId = useStore(session.authStore, (state) => state.currentUser?.id ?? "");
  const isPlatformAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const result = useQuery({
    ...organizationsQueryOptions.detail(session.organizationsApi, userId, organizationId),
    enabled: Boolean(userId) && isPlatformAdmin,
  });
  const [pending, setPending] = useState(false);
  async function enter(manageOwners = false) {
    if (pending) return;
    setPending(true);
    try {
      await switchWebOrganization(session.authApi, session.authStore, organizationId, session);
      if (session.authStore.getState().currentOrganization?.id === organizationId) {
        if (manageOwners && onManageOwners) onManageOwners();
        else onEntered();
      }
    } catch (error) {
      toast.error(error, "进入组织失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }
  const org = result.data;
  return (
    <SecondaryPageLayout
      title={org?.name ?? "组织详情"}
      onBack={onBack}
      breadcrumbs={[
        { key: "platform", label: "平台管理" },
        { key: "organizations", label: "组织管理" },
        { key: "detail", label: "组织详情" },
      ]}
      actions={
        org ? (
          <OrganizationActions organization={org} pending={pending} onEnter={() => void enter()} />
        ) : undefined
      }
    >
      {result.isPending ? (
        <p role="status">正在加载组织资料…</p>
      ) : result.isError ? (
        <div role="alert">
          <p>加载组织资料失败，请稍后重试。</p>
          <Button variant="outline" onClick={() => void result.refetch()}>
            重试
          </Button>
        </div>
      ) : org ? (
        <>
          <section aria-label="组织基本信息" className="space-y-4">
            <h2 className="text-base font-semibold">基本信息</h2>
            <p className="text-sm text-muted-foreground">名称、基础币种和时区在创建后不可修改。</p>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {[
                ["组织名称", org.name],
                ["基础币种", org.baseCurrency],
                ["时区", org.timezone],
                ["状态", org.status === "active" ? "启用" : "停用"],
                ["联系人", org.contactName],
                ["联系电话", org.contactPhone],
                ["地址", org.address],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words">{value || "未填写"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">组织负责人</h2>
            {onManageOwners ? (
              <Button
                variant="outline"
                disabled={pending || org.status !== "active"}
                onClick={() => void enter(true)}
              >
                进入组织管理负责人
              </Button>
            ) : null}
            {org.owners.length ? (
              org.owners.map((owner) => (
                <p key={owner.userId} className="break-words text-sm">
                  {owner.phone ?? owner.email ?? "未填写联系方式"}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">无有效负责人</p>
            )}
          </section>
        </>
      ) : null}
    </SecondaryPageLayout>
  );
}
