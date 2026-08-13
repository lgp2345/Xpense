import { useForm } from "@tanstack/react-form";
import type { PermissionTreeNode } from "@xpense/shared";
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
import type { IamRoleWithPermissions } from "../../services/iam-api";
import { PermissionTree } from "./permission-tree";
import { collectTreePermissionKeys } from "./permission-tree-state";
import { createRoleFormSchema, type RoleFormValues, toRoleSlug } from "./role-form-schema";

export type RoleEditorInput = RoleFormValues;

type RoleEditorDialogProps = {
  canEditMetadata?: boolean;
  canUpdatePermissions: boolean;
  permissionTree: readonly PermissionTreeNode[];
  role?: IamRoleWithPermissions;
  triggerLabel: string;
  onSubmit: (input: RoleEditorInput) => Promise<boolean>;
};

export class RoleEditorSaveError extends Error {
  constructor(readonly operation: "basic-info" | "permissions") {
    super(operation);
    this.name = "RoleEditorSaveError";
  }
}

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
  canEditMetadata = true,
  canUpdatePermissions,
  permissionTree,
  role,
  triggerLabel,
  onSubmit,
}: RoleEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const isEditing = role !== undefined;
  const isEditable = role?.isEditable ?? true;
  const grantablePermissionKeys = new Set(collectTreePermissionKeys(permissionTree));
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      key: role?.key ?? "",
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissionKeys: (role?.permissionKeys ?? []).filter((permissionKey) =>
        grantablePermissionKeys.has(permissionKey),
      ),
    },
    validators: {
      onChange: createRoleFormSchema(isEditing),
      onSubmit: createRoleFormSchema(isEditing),
    },
    onSubmit: async ({ value }) => {
      setSubmissionError(null);

      let didSave: boolean;

      try {
        didSave = await onSubmit({
          key: isEditing ? value.key : toRoleSlug(value.key),
          name: value.name.trim(),
          description: value.description.trim(),
          permissionKeys: value.permissionKeys,
        });
      } catch (error) {
        if (error instanceof RoleEditorSaveError) {
          setSubmissionError(
            error.operation === "basic-info"
              ? "角色基本信息保存失败，请稍后重试。"
              : canEditMetadata
                ? "角色基本信息已保存，但权限保存失败，请稍后重试。"
                : "角色权限保存失败，请稍后重试。",
          );
          return;
        }

        setSubmissionError(isEditing ? "更新角色失败，请稍后重试。" : "新增角色失败，请稍后重试。");
        return;
      }

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
                      disabled={(isEditing && !canEditMetadata) || !isEditable}
                      readOnly={isEditing}
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
                      disabled={!canEditMetadata || !isEditable}
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
                  disabled={!canEditMetadata || !isEditable}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </div>
            )}
          </form.Field>

          {canUpdatePermissions ? (
            <div>
              <h3 className="text-base font-medium">权限</h3>
              <p className="mt-1 text-sm text-muted-foreground">选择该角色可使用的功能权限。</p>
              <div className="mt-3">
                <form.Field name="permissionKeys" mode="array">
                  {(field) => (
                    <PermissionTree
                      disabled={!isEditable}
                      nodes={permissionTree}
                      selected={field.state.value}
                      onChange={(next) => field.handleChange(next)}
                    />
                  )}
                </form.Field>
              </div>
            </div>
          ) : null}

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
