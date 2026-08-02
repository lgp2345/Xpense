import { useOverlayState } from "@heroui/react";
import { Button } from "@heroui/react/button";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { TextField } from "@heroui/react/textfield";
import type { PermissionKey } from "@xpense/shared";
import { type FormEvent, useState } from "react";

import type { IamPermission, IamRole } from "../../services/iam-api";
import { PermissionMatrix } from "./permission-matrix";

export type RoleEditorInput = {
  description: string;
  key: string;
  name: string;
  permissionKeys: PermissionKey[];
};

type RoleEditorDialogProps = {
  canUpdatePermissions: boolean;
  isSubmitting: boolean;
  permissions: IamPermission[];
  role?: IamRole;
  triggerLabel: string;
  onSubmit: (input: RoleEditorInput) => Promise<void>;
};

type FieldErrors = {
  key?: string;
  name?: string;
};

export function RoleEditorDialog({
  canUpdatePermissions,
  isSubmitting,
  permissions,
  role,
  triggerLabel,
  onSubmit,
}: RoleEditorDialogProps) {
  const dialogState = useOverlayState();
  const isEditing = role !== undefined;
  const isEditable = role?.isEditable ?? true;
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissionKeys, setPermissionKeys] = useState<PermissionKey[]>(role?.permissionKeys ?? []);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function resetForm() {
    setKey(role?.key ?? "");
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissionKeys(role?.permissionKeys ?? []);
    setFieldErrors({});
  }

  function validateFields(): FieldErrors {
    const nextErrors: FieldErrors = {};

    if (!isEditing && !toSlug(key)) {
      nextErrors.key = "请输入角色标识";
    }

    if (!name.trim()) {
      nextErrors.name = "请输入角色名称";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFields();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    await onSubmit({
      key: toSlug(key),
      name: name.trim(),
      description: description.trim(),
      permissionKeys,
    });
    resetForm();
    dialogState.close();
  }

  return (
    <Modal state={dialogState}>
      <Modal.Trigger className="inline-flex min-h-10 items-center justify-center rounded-[var(--xp-radius-control)] px-3 text-sm text-[var(--color-ink)] outline outline-1 outline-[var(--color-line-strong)]">
        {triggerLabel}
      </Modal.Trigger>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{isEditing ? "编辑角色" : "新增角色"}</Modal.Heading>
            </Modal.Header>
            <Form className="grid gap-5" onSubmit={handleSubmit} validationBehavior="aria">
              <Modal.Body>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    isInvalid={Boolean(fieldErrors.key)}
                    isReadOnly={isEditing || !isEditable}
                    name="key"
                    value={key}
                    onChange={setKey}
                  >
                    <Label>角色标识</Label>
                    <Input autoComplete="off" placeholder="例如 bookkeeper" />
                    {fieldErrors.key ? <FieldError>{fieldErrors.key}</FieldError> : null}
                  </TextField>
                  <TextField
                    isInvalid={Boolean(fieldErrors.name)}
                    isReadOnly={!isEditable}
                    name="name"
                    value={name}
                    onChange={setName}
                  >
                    <Label>角色名称</Label>
                    <Input autoComplete="off" placeholder="输入角色名称" />
                    {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
                  </TextField>
                </div>
                <TextField
                  isReadOnly={!isEditable}
                  name="description"
                  value={description}
                  onChange={setDescription}
                >
                  <Label>角色说明</Label>
                  <Input autoComplete="off" placeholder="说明该角色的职责" />
                </TextField>
                <div className="mt-2">
                  <h3 className="text-base font-medium text-[var(--color-ink)]">权限</h3>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    选择该角色可使用的功能权限。
                  </p>
                  <div className="mt-3">
                    <PermissionMatrix
                      canUpdatePermissions={canUpdatePermissions}
                      isEditable={isEditable}
                      permissions={permissions}
                      selected={permissionKeys}
                      onChange={setPermissionKeys}
                    />
                  </div>
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary" onPress={resetForm}>
                  取消
                </Button>
                <Button isDisabled={isSubmitting || !isEditable} type="submit">
                  {isSubmitting ? "正在保存..." : isEditing ? "保存角色" : "创建角色"}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
