import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryNode, CategoryType, PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  BookkeepingApi,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../../../services/bookkeeping-api";
import {
  bookkeepingQueryOptions,
  invalidateCategoryMutation,
} from "../../../services/bookkeeping-query";
import { webBookkeepingApi } from "../../../services/web-session";
import { CategoryFormDialog } from "./category-form-dialog";
import { CategoryTreeTable } from "./category-tree-table";

type CategoriesApi = Pick<
  BookkeepingApi,
  "listLedgers" | "listCategories" | "createCategory" | "updateCategory" | "deleteCategory"
>;
type CategoriesPageProps = {
  api?: CategoriesApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
};

/** 两级分类管理页面。 */
export function CategoriesPage({
  api = webBookkeepingApi,
  organizationId,
  permissions,
}: CategoriesPageProps) {
  const queryClient = useQueryClient();
  const ledgersQuery = useQuery(
    bookkeepingQueryOptions.ledgers(api as BookkeepingApi, organizationId),
  );
  const [selectedLedgerId, setSelectedLedgerId] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [lastSuccessfulMutation, setLastSuccessfulMutation] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ledgers = ledgersQuery.data ?? [];
  const defaultLedger = ledgers.find((item) => item.isDefault) ?? ledgers[0];
  const ledgerId = selectedLedgerId || defaultLedger?.id || "";
  const categoriesQuery = useQuery({
    ...bookkeepingQueryOptions.categories(api as BookkeepingApi, organizationId, { ledgerId }),
    enabled: ledgerId.length > 0,
  });
  const categories = categoriesQuery.data ?? [];
  const createMutation = useMutation({
    mutationFn: (input: CreateCategoryRequest) => api.createCategory(input),
    onSuccess: () => invalidateCategoryMutation(queryClient, organizationId),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryRequest }) =>
      api.updateCategory(id, input),
    onSuccess: () => invalidateCategoryMutation(queryClient, organizationId),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => invalidateCategoryMutation(queryClient, organizationId),
  });

  /** 切换账本时仅更新查询键，旧请求结果会留在原账本缓存中。 */
  function handleLedgerChange(nextLedgerId: string) {
    setSelectedLedgerId(nextLedgerId);
    setErrorMessage(null);
  }

  async function handleCreate(input: CreateCategoryRequest) {
    await createMutation.mutateAsync(input);
    toast.success("分类创建成功");
    setLastSuccessfulMutation("分类已创建");
  }

  async function handleUpdate(id: string, input: UpdateCategoryRequest) {
    await updateMutation.mutateAsync({ id, input });
    toast.success("分类已更新");
    setLastSuccessfulMutation("分类已更新");
  }

  async function handleDelete(category: CategoryNode) {
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(category.id);
      toast.success("分类已删除");
    } catch {
      toast.error("删除分类失败，请先处理其子分类或交易引用。");
      setErrorMessage("删除分类失败，请先处理其子分类或交易引用。");
      return;
    }
    setLastSuccessfulMutation("分类已删除");
  }

  const queryErrorMessage =
    ledgersQuery.isError || categoriesQuery.isError
      ? categoriesQuery.data && lastSuccessfulMutation
        ? `${lastSuccessfulMutation}，但刷新列表失败，请重试。`
        : "加载分类失败，请稍后重试。"
      : null;

  const visibleRoots = categories.filter((category) => category.type === type);
  const canCreate = permissions.includes("categories:create");
  const canUpdate = permissions.includes("categories:update");
  const canDelete = permissions.includes("categories:delete");

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">分类管理</h1>
          <p className="text-sm text-muted-foreground">按账本维护收入与支出的两级分类</p>
        </div>
        {canCreate && ledgerId ? (
          <CategoryFormDialog
            ledgerId={ledgerId}
            rootCategories={visibleRoots}
            type={type}
            onCreate={handleCreate}
          />
        ) : null}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={type} onValueChange={(value) => setType(value as CategoryType)}>
          <TabsList>
            <TabsTrigger value="expense">支出分类</TabsTrigger>
            <TabsTrigger value="income">收入分类</TabsTrigger>
          </TabsList>
        </Tabs>
        {ledgers.length > 1 ? (
          <Select value={ledgerId} onValueChange={handleLedgerChange}>
            <SelectTrigger aria-label="账本" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ledgers.map((ledger) => (
                <SelectItem key={ledger.id} value={ledger.id}>
                  {ledger.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {(errorMessage ?? queryErrorMessage) ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessage ?? queryErrorMessage}
        </div>
      ) : null}
      {ledgersQuery.isPending || (ledgerId.length > 0 && categoriesQuery.isPending) ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载分类...</span>
          </CardContent>
        </Card>
      ) : visibleRoots.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          当前没有{type === "expense" ? "支出" : "收入"}分类。
        </p>
      ) : (
        <CategoryTreeTable
          canCreate={canCreate}
          canDelete={canDelete}
          canUpdate={canUpdate}
          disabled={deleteMutation.isPending}
          ledgerId={ledgerId}
          roots={visibleRoots}
          type={type}
          onCreate={handleCreate}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </main>
  );
}
