import { useOverlayState } from "@heroui/react";
import { Button } from "@heroui/react/button";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Select } from "@heroui/react/select";
import { TextField } from "@heroui/react/textfield";
import { type FormEvent, useState } from "react";

import type { IamRole } from "../../services/iam-api";

type MemberFormDialogProps = {
  isSubmitting: boolean;
  roles: IamRole[];
  onSubmit: (input: { roleId: string; userId: string }) => Promise<void>;
};

type FieldErrors = {
  roleId?: string;
  userId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function MemberFormDialog({ isSubmitting, roles, onSubmit }: MemberFormDialogProps) {
  const dialogState = useOverlayState();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function validateFields(): FieldErrors {
    const nextErrors: FieldErrors = {};
    const trimmedUserId = userId.trim();

    if (!trimmedUserId) {
      nextErrors.userId = "请输入用户 ID";
    } else if (!uuidPattern.test(trimmedUserId)) {
      nextErrors.userId = "请输入有效的 UUID";
    }

    if (!roleId) {
      nextErrors.roleId = "请选择角色";
    }

    return nextErrors;
  }

  function resetForm() {
    setUserId("");
    setRoleId(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFields();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !roleId) {
      return;
    }

    await onSubmit({ roleId, userId: userId.trim() });
    resetForm();
    dialogState.close();
  }

  return (
    <Modal state={dialogState}>
      <Modal.Trigger className="inline-flex min-h-10 items-center justify-center rounded-[var(--xp-radius-pill)] bg-[var(--color-ink)] px-5 text-sm font-medium text-white">
        新增成员
      </Modal.Trigger>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>新增成员</Modal.Heading>
            </Modal.Header>
            <Form className="grid gap-5" onSubmit={handleSubmit} validationBehavior="aria">
              <Modal.Body>
                <TextField
                  isInvalid={Boolean(fieldErrors.userId)}
                  name="userId"
                  value={userId}
                  onChange={setUserId}
                >
                  <Label>用户 ID</Label>
                  <Input autoComplete="off" placeholder="输入用户 UUID" />
                  {fieldErrors.userId ? <FieldError>{fieldErrors.userId}</FieldError> : null}
                </TextField>

                <Select
                  aria-label="角色"
                  isInvalid={Boolean(fieldErrors.roleId)}
                  placeholder="选择角色"
                  value={roleId}
                  onChange={(value) => setRoleId(value === null ? null : String(value))}
                >
                  <Label>角色</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {roles.map((role) => (
                        <ListBox.Item id={role.id} key={role.id} textValue={role.name}>
                          {role.name}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                  {fieldErrors.roleId ? <FieldError>{fieldErrors.roleId}</FieldError> : null}
                </Select>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button isDisabled={isSubmitting} type="submit">
                  {isSubmitting ? "正在添加..." : "添加成员"}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
