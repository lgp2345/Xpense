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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IamRole } from "../../services/iam-api";
import { type MemberFormValues, memberFormSchema } from "./member-form-schema";

type MemberFormDialogProps = {
  roles: IamRole[];
  onSubmit: (input: MemberFormValues) => Promise<void>;
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

export function MemberFormDialog({ roles, onSubmit }: MemberFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      userId: "",
      roleId: "",
    },
    validators: {
      onChange: memberFormSchema,
      onSubmit: memberFormSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);

      try {
        await onSubmit(value);
        setOpen(false);
        form.reset();
      } catch {
        setSubmitError("添加成员失败，请稍后重试。");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新增成员</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>新增成员</DialogTitle>
          <DialogDescription>输入用户 ID 并选择一个角色。</DialogDescription>
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
          <form.Field name="userId">
            {(field) => {
              const fieldError = field.state.meta.isTouched
                ? getValidationMessage(field.state.meta.errors[0])
                : undefined;

              return (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>用户 ID</Label>
                  <Input
                    autoComplete="off"
                    id={field.name}
                    placeholder="输入用户 UUID"
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

          <form.Field name="roleId">
            {(field) => {
              const fieldError = field.state.meta.isTouched
                ? getValidationMessage(field.state.meta.errors[0])
                : undefined;

              return (
                <div className="grid gap-2">
                  <Label>角色</Label>
                  <Select value={field.state.value || undefined} onValueChange={field.handleChange}>
                    <SelectTrigger aria-label="角色" className="w-full">
                      <SelectValue placeholder="选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {fieldError}
                    </p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>

          {submitError ? (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
              {({ isSubmitting }) => (
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "正在添加..." : "添加成员"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
