import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import type { UserOrganization } from "@/services/auth-api";
import type { WebSessionDependency } from "@/services/web-session";

const organizationIdSchema = z.string().min(1);

export function MenuResetPage({ session }: { session: WebSessionDependency }) {
  const form = useForm({ defaultValues: { selectedOrganizationId: "" } });
  const { selectedOrganizationId } = useStore(form.store, (state) => state.values);
  const setSelectedOrganizationId = (value: typeof selectedOrganizationId) =>
    form.setFieldValue("selectedOrganizationId", value);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );

  useEffect(() => {
    let isActive = true;

    void session.authApi
      .listOrganizations()
      .then((items) => {
        if (isActive) {
          setOrganizations(items.filter((organization) => organization.status === "active"));
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage("加载组织列表失败，请稍后重试。");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [session.authApi]);

  async function handleReset() {
    const selectedId = organizationIdSchema.safeParse(selectedOrganizationId);

    if (!selectedId.success || !selectedOrganization || isResetting) {
      return;
    }

    setErrorMessage(null);
    setIsResetting(true);

    try {
      await session.iamApi.resetOrganizationMenus(selectedId.data);

      if (session.authStore.getState().currentOrganization?.id === selectedId.data) {
        session.menuStore.getState().clearMenus();
        await session.menuStore
          .getState()
          .loadMenusForOrganization(selectedId.data, session.iamApi.getAuthorizedMenus);
      }

      toast.success(`“${selectedOrganization.name}”的菜单已恢复`);
    } catch {
      setErrorMessage("恢复菜单失败，请稍后重试。");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">菜单恢复</h1>
        <FieldDescription className="text-sm text-muted-foreground">
          为指定组织恢复默认菜单。此操作会替换目标组织当前的菜单配置。
        </FieldDescription>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>选择目标组织</CardTitle>
          <CardDescription>必须明确选择组织后才能执行恢复。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field data-invalid={Boolean(errorMessage)}>
            <FieldLabel htmlFor="menu-reset-organization">目标组织</FieldLabel>
            <Select
              disabled={isLoading || isResetting}
              value={selectedOrganizationId}
              onValueChange={setSelectedOrganizationId}
            >
              <SelectTrigger
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? "menu-reset-error" : undefined}
                aria-label="目标组织"
                className="w-full"
                id="menu-reset-organization"
              >
                <SelectValue placeholder={isLoading ? "正在加载组织..." : "请选择组织"} />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="menu-reset-error">{errorMessage}</FieldError>
          </Field>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={!selectedOrganization || isLoading || isResetting}
                variant="destructive"
              >
                恢复默认菜单
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认恢复默认菜单</AlertDialogTitle>
                <AlertDialogDescription>
                  确认恢复“{selectedOrganization?.name}”的默认菜单？目标组织现有菜单配置将被替换。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={isResetting}
                  onClick={() => void handleReset()}
                >
                  确认恢复
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </main>
  );
}
