import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganizationProfile } from "@xpense/shared";
import { useState } from "react";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { organizationsKeys, organizationsQueryOptions } from "@/services/organizations-query";
import type { WebSessionDependency } from "@/services/web-session";
import { organizationSettingsSchema } from "./organization-settings-schema";
export function OrganizationSettingsPage({ session }: { session: WebSessionDependency }) {
  const orgId = useStore(session.authStore, (s) => s.currentOrganization?.id ?? "");
  const userId = useStore(session.authStore, (s) => s.currentUser?.id ?? "");
  const allowed = useStore(
    session.authStore,
    (s) =>
      Boolean(s.currentUser?.isSuperAdmin || s.role?.key === "owner") &&
      s.permissions.includes("organization_settings:read"),
  );
  const canUpdate = useStore(session.authStore, (s) =>
    s.permissions.includes("organization_settings:update"),
  );
  const query = useQuery({
    ...organizationsQueryOptions.settings(session.organizationsApi, userId, orgId),
    enabled: allowed && Boolean(orgId),
  });
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">组织设置</h1>
        <p className="text-sm text-muted-foreground">维护当前组织的联系资料</p>
      </header>
      {!allowed ? (
        <p role="alert">仅组织负责人或平台超级管理员可维护组织资料。</p>
      ) : query.isPending ? (
        <p role="status">正在加载组织资料…</p>
      ) : query.isError ? (
        <div role="alert">
          加载组织资料失败。
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <SettingsForm key={orgId} profile={query.data} session={session} canUpdate={canUpdate} />
      )}
    </main>
  );
}
function SettingsForm({
  profile,
  session,
  canUpdate,
}: {
  profile: OrganizationProfile;
  session: WebSessionDependency;
  canUpdate: boolean;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const defaults = {
    contactName: profile.contactName ?? "",
    contactPhone: profile.contactPhone ?? "",
    address: profile.address ?? "",
  };
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: organizationSettingsSchema },
    onSubmit: async ({ value }) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        const input = organizationSettingsSchema.parse(value);
        const saved = await session.organizationsApi.updateSettings({
          contactName: input.contactName || null,
          contactPhone: input.contactPhone || null,
          address: input.address || null,
        });
        form.reset({
          contactName: saved.contactName ?? "",
          contactPhone: saved.contactPhone ?? "",
          address: saved.address ?? "",
        });
        await client.invalidateQueries({ queryKey: ["organization-settings"] });
        await client.invalidateQueries({ queryKey: organizationsKeys.root });
        toast.success("组织资料已保存");
      } catch {
        setError("保存组织资料失败，请稍后重试。");
      } finally {
        setBusy(false);
      }
    },
  });
  return (
    <>
      <section className="space-y-3">
        <h2 className="font-semibold">基本信息</h2>
        <p className="text-sm text-muted-foreground">名称、基础币种和时区在创建后不可修改。</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {[
            ["组织名称", profile.name],
            ["基础币种", profile.baseCurrency],
            ["时区", profile.timezone],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <form
        noValidate
        className="space-y-4 border-t pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <h2 className="font-semibold">联系资料（选填）</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["contactName", "contactPhone", "address"] as const).map((name, i) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <Field className={name === "address" ? "sm:col-span-2" : ""}>
                  <FieldLabel htmlFor={`settings-${name}`}>
                    {["联系人", "联系电话", "地址"][i]}
                  </FieldLabel>
                  <Input
                    id={`settings-${name}`}
                    value={field.state.value}
                    disabled={!canUpdate || busy}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {canUpdate ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                form.reset(defaults);
                setError("");
              }}
            >
              取消修改
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存资料"}
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
