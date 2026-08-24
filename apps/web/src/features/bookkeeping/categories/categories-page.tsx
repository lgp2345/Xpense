import type { CategoryNode, CategoryType, LedgerSummary, PermissionKey } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
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
import { webBookkeepingApi } from "../../../services/web-session";
import { CategoryFormDialog } from "./category-form-dialog";
import { CategoryTreeTable } from "./category-tree-table";

type CategoriesApi = Pick<
  BookkeepingApi,
  "listLedgers" | "listCategories" | "createCategory" | "updateCategory" | "deleteCategory"
>;
type CategoriesPageProps = { api?: CategoriesApi; permissions: readonly PermissionKey[] };

/** 两级分类管理页面。 */
export function CategoriesPage({ api = webBookkeepingApi, permissions }: CategoriesPageProps) {
  const [ledgers, setLedgers] = useState<LedgerSummary[]>([]);
  const [ledgerId, setLedgerId] = useState("");
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [type, setType] = useState<CategoryType>("expense");
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const categoryRequestId = useRef(0);

  async function refreshCategories(activeLedgerId = ledgerId): Promise<boolean> {
    const requestId = ++categoryRequestId.current;
    try {
      const items = await api.listCategories({ ledgerId: activeLedgerId });
      if (requestId !== categoryRequestId.current) return false;
      setCategories(items);
      return true;
    } catch (error) {
      if (requestId !== categoryRequestId.current) return false;
      throw error;
    }
  }

  useEffect(() => {
    let isActive = true;
    const requestId = ++categoryRequestId.current;
    void api
      .listLedgers()
      .then(async (items) => {
        const activeLedger = items.find((item) => item.isDefault) ?? items[0];
        const nextCategories = activeLedger
          ? await api.listCategories({ ledgerId: activeLedger.id })
          : [];
        if (isActive && requestId === categoryRequestId.current) {
          setLedgers(items);
          setLedgerId(activeLedger?.id ?? "");
          setCategories(nextCategories);
        }
      })
      .catch(() => {
        if (isActive && requestId === categoryRequestId.current) {
          setErrorMessage("加载分类失败，请稍后重试。");
        }
      })
      .finally(() => {
        if (isActive && requestId === categoryRequestId.current) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [api]);

  async function handleLedgerChange(nextLedgerId: string) {
    setLedgerId(nextLedgerId);
    setIsLoading(true);
    setErrorMessage(null);
    let applied = false;
    try {
      applied = await refreshCategories(nextLedgerId);
    } catch {
      setErrorMessage("加载分类失败，请稍后重试。");
      applied = true;
    } finally {
      if (applied) setIsLoading(false);
    }
  }

  async function handleCreate(input: CreateCategoryRequest) {
    await api.createCategory(input);
    toast.success("分类创建成功");
    await refreshAfterMutation("分类已创建，但刷新列表失败，请重试。");
  }

  async function handleUpdate(id: string, input: UpdateCategoryRequest) {
    await api.updateCategory(id, input);
    toast.success("分类已更新");
    await refreshAfterMutation("分类已更新，但刷新列表失败，请重试。");
  }

  async function refreshAfterMutation(message: string) {
    try {
      await refreshCategories();
    } catch {
      setErrorMessage(message);
    }
  }

  async function handleDelete(category: CategoryNode) {
    setIsMutating(true);
    setErrorMessage(null);
    try {
      await api.deleteCategory(category.id);
      toast.success("分类已删除");
    } catch {
      toast.error("删除分类失败，请先处理其子分类或交易引用。");
      setErrorMessage("删除分类失败，请先处理其子分类或交易引用。");
      setIsMutating(false);
      return;
    }

    try {
      await refreshCategories();
    } catch {
      setErrorMessage("分类已删除，但刷新列表失败，请重试。");
    } finally {
      setIsMutating(false);
    }
  }

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
          <Select value={ledgerId} onValueChange={(value) => void handleLedgerChange(value)}>
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
      {errorMessage ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      {isLoading ? (
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
          disabled={isMutating}
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
