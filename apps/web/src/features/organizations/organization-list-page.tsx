import { useQuery } from "@tanstack/react-query";
import type { OrganizationDetail, OrganizationListQuery } from "@xpense/shared";
import { useState } from "react";
import { useStore } from "zustand";
import { SecondaryPageLayout } from "@/components/layout/secondary-page-layout";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { organizationsQueryOptions } from "@/services/organizations-query";
import { switchWebOrganization, type WebSessionDependency } from "@/services/web-session";
import { OrganizationRow } from "./organization-columns";

export function OrganizationListPage({
  session,
  query,
  onQueryChange,
  onDetail,
  onEntered,
}: {
  session: WebSessionDependency;
  query: OrganizationListQuery;
  onQueryChange: (query: OrganizationListQuery) => void;
  onDetail: (id: string) => void;
  onEntered: () => void;
}) {
  const userId = useStore(session.authStore, (state) => state.currentUser?.id ?? "");
  const isPlatformAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const result = useQuery({
    ...organizationsQueryOptions.list(session.organizationsApi, userId, query),
    enabled: Boolean(userId) && isPlatformAdmin,
  });
  const [entering, setEntering] = useState<string | null>(null);
  async function enter(organization: OrganizationDetail) {
    if (entering) return;
    setEntering(organization.id);
    try {
      await switchWebOrganization(session.authApi, session.authStore, organization.id, session);
      if (session.authStore.getState().currentOrganization?.id === organization.id) onEntered();
    } catch (error) {
      toast.error(error, "进入组织失败，请稍后重试。");
    } finally {
      setEntering(null);
    }
  }
  return (
    <SecondaryPageLayout
      title="组织管理"
      description="查看组织资料、负责人及运行状态，选择组织进入业务工作区。"
      breadcrumbs={[
        { key: "platform", label: "平台管理" },
        { key: "organizations", label: "组织管理" },
      ]}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="组织名称"
          placeholder="搜索组织名称"
          className="sm:max-w-sm"
          value={query.name ?? ""}
          onChange={(event) =>
            onQueryChange({ ...query, page: 1, name: event.target.value || undefined })
          }
        />
        <Select
          value={query.status ?? "all"}
          onValueChange={(value) =>
            onQueryChange({
              ...query,
              page: 1,
              status: value === "active" || value === "disabled" ? value : undefined,
            })
          }
        >
          <SelectTrigger aria-label="组织状态" className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="disabled">停用</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {result.isPending ? (
        <p role="status">正在加载组织…</p>
      ) : result.isError ? (
        <div role="alert" className="space-y-3">
          <p>加载组织失败，请稍后重试。</p>
          <Button variant="outline" onClick={() => void result.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {["组织名称", "币种", "状态", "负责人", "操作"].map((name) => (
                  <TableHead key={name}>{name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.items.map((organization) => (
                <OrganizationRow
                  key={organization.id}
                  organization={organization}
                  onDetail={() => onDetail(organization.id)}
                  onEnter={() => void enter(organization)}
                  pending={entering !== null}
                />
              ))}
            </TableBody>
          </Table>
          {result.data.items.length === 0 ? (
            <p role="status" className="py-12 text-center text-sm text-muted-foreground">
              暂无符合条件的组织
            </p>
          ) : null}
          <Pagination
            page={query.page}
            pageSize={query.pageSize}
            total={result.data.total}
            onPageChange={(page) => onQueryChange({ ...query, page })}
            onPageSizeChange={(pageSize) => onQueryChange({ ...query, page: 1, pageSize })}
          />
        </>
      )}
    </SecondaryPageLayout>
  );
}
