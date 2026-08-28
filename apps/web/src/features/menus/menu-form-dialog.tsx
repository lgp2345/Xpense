import { useForm } from "@tanstack/react-form";
import {
  type MenuConfigurationNode,
  type MenuIconKey,
  type MenuType,
  menuIconKeys,
  type PermissionKey,
  permissionKeys,
  type RouteKey,
} from "@xpense/shared";
import {
  Building2,
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  ReceiptText,
  ScrollText,
  Shapes,
  Shield,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type MenuFormDraft,
  type MenuFormValues,
  type MenuRouteOption,
  menuFormDraftSchema,
} from "./menu-form-schema";
import { getMenuParentOptions } from "./menu-parent-options";

const ROOT_PARENT_VALUE = "root";
const NO_ICON_VALUE = "none";

const ICONS: Record<MenuIconKey, LucideIcon> = {
  Building2,
  LayoutDashboard,
  MonitorSmartphone,
  ReceiptText,
  ScrollText,
  Shapes,
  Shield,
  ShieldCheck,
  Users,
  WalletCards,
};

type MenuFormDialogProps = {
  busy: boolean;
  initialParentId?: number | null;
  node?: MenuConfigurationNode;
  open: boolean;
  routeOptions: MenuRouteOption[];
  tree: readonly MenuConfigurationNode[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: MenuFormValues) => Promise<boolean>;
};

export function MenuFormDialog({
  busy,
  initialParentId = null,
  node,
  open,
  routeOptions,
  tree,
  onOpenChange,
  onSubmit,
}: MenuFormDialogProps) {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const isEditing = node !== undefined;
  const form = useForm({
    defaultValues: getDefaultDraft(node, initialParentId),
    validators: {
      onChange: menuFormDraftSchema,
      onSubmit: menuFormDraftSchema,
    },
    onSubmit: async ({ value }) => {
      if (busy) {
        return;
      }

      setSubmissionError(null);
      const parsed = menuFormDraftSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      const didSave = await onSubmit(parsed.data);

      if (!didSave) {
        setSubmissionError(
          isEditing ? "更新菜单节点失败，请稍后重试。" : "创建菜单节点失败，请稍后重试。",
        );
        return;
      }

      onOpenChange(false);
      form.reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑菜单节点" : "新增菜单节点"}</DialogTitle>
          <DialogDescription>
            前端校验用于辅助录入，最终父子结构和权限规则仍由服务端确认。
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) {
              void form.handleSubmit();
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="type">
              {(field) => (
                <div className="grid gap-2">
                  <Label>节点类型</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      const type = value as MenuType;
                      field.handleChange(type);
                      const parentId = form.state.values.parentId;
                      const isLegalParent =
                        parentId === null
                          ? type !== "button"
                          : getMenuParentOptions(tree, {
                              type,
                              editingNodeId: node?.id,
                            }).some((option) => option.id === parentId);

                      if (!isLegalParent) {
                        form.setFieldValue("parentId", null);
                      }
                    }}
                  >
                    <SelectTrigger aria-label="节点类型" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="directory">目录</SelectItem>
                      <SelectItem value="menu">菜单</SelectItem>
                      <SelectItem value="button">按钮</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="name">
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>名称</Label>
                  <Input
                    autoComplete="off"
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={Boolean(
                      getFieldError(field.state.meta.errors, field.state.meta.isTouched),
                    )}
                  />
                  <FieldError
                    errors={field.state.meta.errors}
                    isTouched={field.state.meta.isTouched}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe
            selector={(state) =>
              [state.values.type, state.values.menuMode, state.values.routeKey] as const
            }
          >
            {([type, menuMode, routeKey]) => {
              const parentOptions = getMenuParentOptions(tree, {
                type,
                editingNodeId: node?.id,
              });

              return (
                <>
                  {type === "menu" ? (
                    <form.Field name="menuMode">
                      {(field) => (
                        <div className="grid gap-2">
                          <Label>菜单模式</Label>
                          <Select
                            value={field.state.value}
                            onValueChange={(value) =>
                              field.handleChange(value as "internal" | "external")
                            }
                          >
                            <SelectTrigger aria-label="菜单模式" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="internal">内部菜单</SelectItem>
                              <SelectItem value="external">外链菜单</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </form.Field>
                  ) : null}

                  <form.Field name="parentId">
                    {(field) => (
                      <div className="grid gap-2">
                        <Label>{parentLabel(type)}</Label>
                        <Select
                          value={
                            field.state.value === null
                              ? ROOT_PARENT_VALUE
                              : String(field.state.value)
                          }
                          onValueChange={(value) =>
                            field.handleChange(value === ROOT_PARENT_VALUE ? null : Number(value))
                          }
                        >
                          <SelectTrigger aria-label={parentLabel(type)} className="w-full">
                            <SelectValue placeholder={`选择${parentLabel(type)}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {type !== "button" ? (
                              <SelectItem value={ROOT_PARENT_VALUE}>根节点</SelectItem>
                            ) : null}
                            {parentOptions.map((option) => (
                              <SelectItem key={option.id} value={String(option.id)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError
                          errors={field.state.meta.errors}
                          isTouched={field.state.meta.isTouched}
                        />
                      </div>
                    )}
                  </form.Field>

                  {type === "menu" && menuMode === "internal" ? (
                    <form.Field name="routeKey">
                      {(field) => (
                        <div className="grid gap-2">
                          <Label>注册路由</Label>
                          <Select
                            value={field.state.value || undefined}
                            onValueChange={(value) => field.handleChange(value as RouteKey)}
                          >
                            <SelectTrigger aria-label="注册路由" className="h-auto min-h-9 w-full">
                              <SelectValue placeholder="选择已注册路由" />
                            </SelectTrigger>
                            <SelectContent>
                              {routeOptions.map((option) => (
                                <SelectItem key={option.key} value={option.key}>
                                  <span className="flex flex-col items-start">
                                    <span>{option.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {option.path} {option.key}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {routeKey ? (
                            <p className="text-xs text-muted-foreground">
                              {routeOptions.find((option) => option.key === routeKey)?.path} ·{" "}
                              {routeKey}
                            </p>
                          ) : null}
                          <FieldError
                            errors={field.state.meta.errors}
                            isTouched={field.state.meta.isTouched}
                          />
                        </div>
                      )}
                    </form.Field>
                  ) : null}

                  {type === "menu" && menuMode === "external" ? (
                    <form.Field name="url">
                      {(field) => (
                        <div className="grid gap-2">
                          <Label htmlFor={field.name}>外链 URL</Label>
                          <Input
                            autoComplete="url"
                            id={field.name}
                            placeholder="https://example.com"
                            type="url"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            aria-invalid={Boolean(
                              getFieldError(field.state.meta.errors, field.state.meta.isTouched),
                            )}
                          />
                          <FieldError
                            errors={field.state.meta.errors}
                            isTouched={field.state.meta.isTouched}
                          />
                        </div>
                      )}
                    </form.Field>
                  ) : null}

                  {type !== "button" ? (
                    <form.Field name="icon">
                      {(field) => (
                        <div className="grid gap-2">
                          <Label>图标</Label>
                          <Select
                            value={field.state.value ?? NO_ICON_VALUE}
                            onValueChange={(value) =>
                              field.handleChange(
                                value === NO_ICON_VALUE ? null : (value as MenuIconKey),
                              )
                            }
                          >
                            <SelectTrigger aria-label="图标" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_ICON_VALUE}>无图标</SelectItem>
                              {menuIconKeys.map((icon) => {
                                const Icon = ICONS[icon];

                                return (
                                  <SelectItem key={icon} value={icon}>
                                    <Icon aria-hidden="true" />
                                    {icon}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </form.Field>
                  ) : null}

                  {type !== "directory" ? (
                    <form.Field name="permissionCode">
                      {(field) => (
                        <div className="grid gap-2">
                          <Label>权限</Label>
                          <Select
                            value={field.state.value || undefined}
                            onValueChange={(value) => field.handleChange(value as PermissionKey)}
                          >
                            <SelectTrigger aria-label="权限" className="w-full">
                              <SelectValue placeholder="选择权限" />
                            </SelectTrigger>
                            <SelectContent>
                              {permissionKeys.map((permission) => (
                                <SelectItem key={permission} value={permission}>
                                  {permission}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldError
                            errors={field.state.meta.errors}
                            isTouched={field.state.meta.isTouched}
                          />
                        </div>
                      )}
                    </form.Field>
                  ) : null}

                  {type !== "button" ? (
                    <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                      <form.Field name="isVisible">
                        {(field) => (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={field.state.value}
                              id="menu-is-visible"
                              onCheckedChange={(checked) => field.handleChange(checked === true)}
                            />
                            <Label htmlFor="menu-is-visible">自身可见</Label>
                          </div>
                        )}
                      </form.Field>

                      {type === "menu" && menuMode === "internal" ? (
                        <form.Field name="keepAlive">
                          {(field) => (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={field.state.value}
                                id="menu-keep-alive"
                                onCheckedChange={(checked) => field.handleChange(checked === true)}
                              />
                              <Label htmlFor="menu-keep-alive">页面保活</Label>
                            </div>
                          )}
                        </form.Field>
                      ) : null}
                    </div>
                  ) : null}
                </>
              );
            }}
          </form.Subscribe>

          {submissionError ? (
            <p className="text-sm text-destructive" role="alert">
              {submissionError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button disabled={busy || isSubmitting} type="submit">
                  {isSubmitting ? "正在保存..." : isEditing ? "保存节点" : "创建节点"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultDraft(
  node: MenuConfigurationNode | undefined,
  initialParentId: number | null,
): MenuFormDraft {
  if (!node) {
    return {
      type: initialParentId === null ? "directory" : "menu",
      menuMode: "internal",
      name: "",
      parentId: initialParentId,
      routeKey: "",
      url: "",
      icon: null,
      permissionCode: "",
      isVisible: true,
      keepAlive: false,
    };
  }

  return {
    type: node.type,
    menuMode: node.type === "menu" && node.isExternal ? "external" : "internal",
    name: node.name,
    parentId: node.parentId,
    routeKey: node.type === "menu" && !node.isExternal ? node.routeKey : "",
    url: node.type === "menu" && node.isExternal ? node.url : "",
    icon: node.type === "button" ? null : node.icon,
    permissionCode: node.type === "directory" ? "" : node.permissionCode,
    isVisible: node.type === "button" ? true : node.isVisible,
    keepAlive: node.type === "menu" && !node.isExternal ? node.keepAlive : false,
  };
}

function parentLabel(type: MenuType): "父目录" | "父节点" | "所属菜单" {
  if (type === "directory") {
    return "父目录";
  }
  if (type === "button") {
    return "所属菜单";
  }
  return "父节点";
}

function FieldError({ errors, isTouched }: { errors: unknown[]; isTouched: boolean }) {
  const message = getFieldError(errors, isTouched);

  return message ? (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function getFieldError(errors: unknown[], isTouched: boolean): string | undefined {
  if (!isTouched) {
    return undefined;
  }

  for (const error of errors) {
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object" && "message" in error) {
      const message = error.message;

      if (typeof message === "string") {
        return message;
      }
    }
    if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
      const issue = error.issues[0];

      if (issue && typeof issue === "object" && "message" in issue) {
        const message = issue.message;

        if (typeof message === "string") {
          return message;
        }
      }
    }
  }

  return undefined;
}
