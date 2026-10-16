import { useQuery } from "@tanstack/react-query";
import type { RentalSpaceNode } from "@xpense/shared";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { PropertyContractList } from "./property-contract-list";

/** 按空间主键查询当前生效合同，与房产全部合同列表独立分页。 */
export function SpaceContractsSheet({
  api,
  organizationId,
  propertyId,
  space,
  onClose,
  onNavigateContract,
}: {
  api: RentalApi;
  organizationId: string;
  propertyId: string;
  space: RentalSpaceNode;
  onClose: () => void;
  onNavigateContract?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useQuery({
    ...rentalQueryOptions.contracts(api, organizationId, {
      propertyId,
      spaceId: space.id,
      currentOnly: true,
      page,
      pageSize,
    }),
    retry: false,
  });
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-hidden sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b px-5 pb-5 pt-6">
          <SheetTitle className="pr-8 text-lg font-semibold break-words">
            {space.name} 的当前合同
          </SheetTitle>
          <SheetDescription>仅展示此空间当前生效的合同，包含进行中和即将到期。</SheetDescription>
          {space.code ? (
            <p className="text-xs text-muted-foreground break-all">空间编码：{space.code}</p>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6">
          {query.isPending ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <span className="sr-only">正在加载空间合同...</span>
            </div>
          ) : query.isError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {query.error instanceof ApiError && query.error.status === 403
                ? "你没有查看此空间合同的权限。"
                : "加载空间合同失败，请稍后重试。"}
              <Button variant="link" className="ml-2 px-0" onClick={() => void query.refetch()}>
                重试
              </Button>
            </div>
          ) : query.data.items.length ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">共 {query.data.total} 份合同</span>
                <span>最近更新在前</span>
              </div>
              <PropertyContractList
                compact
                items={query.data.items}
                onNavigateContract={
                  onNavigateContract
                    ? (id) => {
                        onClose();
                        onNavigateContract(id);
                      }
                    : undefined
                }
              />
              <Pagination
                page={query.data.page}
                pageSize={query.data.pageSize}
                total={query.data.total}
                pending={query.isFetching}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
              <FileText aria-hidden="true" className="mx-auto mb-3 size-6 text-muted-foreground" />
              <p className="text-sm font-medium">此空间暂无当前生效合同</p>
              <p className="mt-2 text-xs text-muted-foreground">
                草稿、待生效及已结束的合同可在房产合同列表查看。
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
