import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IamPermission, IamRoleWithPermissions } from "../../services/iam-api";
import { PermissionMatrix } from "./permission-matrix";
import { createRoleFormSchema, type RoleFormValues, toRoleSlug } from "./role-form-schema";

export type RoleEditorInput = RoleFormValues;

type RoleEditorDialogProps = {
  canUpdatePermissions: boolean;
  permissions: IamPermission[];
  role?: IamRoleWithPermissions;
  triggerLabel: string;
  onSubmit: (input: RoleEditorInput) => Promise<boolean>;
};

function getValidationMessage(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  if ("issues" in error && Array.isArray(error.issues)) {
    const firstIssue = error.issues[0];

    if (
      firstIssue &&
      typeof firstIssue === "object" &&
      "message" in firstIssue &&
      typeof firstIssue.message === "string"
    ) {
      return firstIssue.message;
    }
  }

  return undefined;
}

export function RoleEditorDialog({
  canUpdatePermissions,
  permissions,
  role,
  triggerLabel,
  onSubmit,
}: RoleEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const isEditing = role !== undefined;
  const isEditable = role?.isEditable ?? true;
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      key: role?.key ?? "",
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissionKeys: role?.permissionKeys ?? [],
    },
    validators: {
      onChange: createRoleFormSchema(isEditing),
      onSubmit: createRoleFormSchema(isEditing),
    },
    onSubmit: async ({ value }) => {
      setSubmissionError(null);

      const didSave = await onSubmit({
        key: isEditing ? value.key : toRoleSlug(value.key),
        name: value.name.trim(),
        description: value.description.trim(),
        permissionKeys: value.permissionKeys,
      });

      if (!didSave) {
        setSubmissionError(isEditing ? "更新角色失败，请稍后重试。" : "新增角色失败，请稍后重试。");
        return;
      }

      setOpen(false);
      form.reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEditing ? "outline" : "default"}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑角色" : "新增角色"}</DialogTitle>
          <DialogDescription>配置角色基本信息与功能权限。</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="key">
              {(field) => {
                const fieldError = field.state.meta.isTouched
                  ? getValidationMessage(field.state.meta.errors[0])
                  : undefined;

                return (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>角色标识</Label>
                    <Input
                      autoComplete="off"
                      id={field.name}
                      placeholder="例如 bookkeeper"
                      readOnly={isEditing || !isEditable}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={Boolean(fieldError)}
                    />
                    {fieldError ? (
                      <p className="text-sm text-destructive" role="alert">
                        {fieldError}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="name">
              {(field) => {
                const fieldError = field.state.meta.isTouched
                  ? getValidationMessage(field.state.meta.errors[0])
                  : undefined;

                return (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>角色名称</Label>
                    <Input
                      autoComplete="off"
                      id={field.name}
                      placeholder="输入角色名称"
                      readOnly={!isEditable}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={Boolean(fieldError)}
                    />
                    {fieldError ? (
                      <p className="text-sm text-destructive" role="alert">
                        {fieldError}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>
          </div>

          <form.Field name="description">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>角色说明</Label>
                <Input
                  autoComplete="off"
                  id={field.name}
                  placeholder="说明该角色的职责"
                  readOnly={!isEditable}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </div>
            )}
          </form.Field>

          <div>
            <h3 className="text-base font-medium">权限</h3>
            <p className="mt-1 text-sm text-muted-foreground">选择该角色可使用的功能权限。</p>
            <div className="mt-3">
              <form.Field name="permissionKeys">
                {(field) => (
                  <PermissionMatrix
                    canUpdatePermissions={canUpdatePermissions}
                    isEditable={isEditable}
                    permissions={permissions}
                    selected={field.state.value}
                    onChange={(next) => field.handleChange(next)}
                  />
                )}
              </form.Field>
            </div>
          </div>

          {submissionError ? (
            <p className="text-sm text-destructive" role="alert">
              {submissionError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
              {({ isSubmitting }) => (
                <Button disabled={isSubmitting || !isEditable} type="submit">
                  {isSubmitting ? "正在保存..." : isEditing ? "保存角色" : "创建角色"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
