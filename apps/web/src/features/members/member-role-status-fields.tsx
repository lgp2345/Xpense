import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import MultipleSelector from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IamRole } from "../../services/iam-api";
import type { MemberFormValues } from "./member-form-schema";

type MemberRoleFieldProps = {
  roles: IamRole[];
  value: string[];
  error?: string;
  disabled: boolean;
  onBlur: () => void;
  onChange: (roleIds: string[]) => void;
};

export function MemberRoleField({
  roles,
  value,
  error,
  disabled,
  onBlur,
  onChange,
}: MemberRoleFieldProps) {
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="roleIds">角色</FieldLabel>
      <MultipleSelector
        className="flex min-h-9 items-center bg-transparent shadow-xs dark:bg-input/30 [&>div]:w-full"
        badgeClassName="h-6 max-w-full [&>button]:size-6"
        commandProps={{
          label: "角色",
          className: "[&_[data-state=open]]:static [&_[data-state=open]]:mt-2",
          "aria-invalid": Boolean(error),
        }}
        emptyIndicator={<span>没有匹配的角色</span>}
        inputProps={{
          className: "min-w-24 py-0 text-base md:text-sm",
          id: "roleIds",
          "aria-label": "角色",
          "aria-invalid": Boolean(error),
          "aria-describedby": error ? "roleIds-error" : undefined,
          onBlur,
        }}
        options={roleOptions}
        placeholder="选择一个或多个角色"
        disabled={disabled}
        value={value.flatMap((roleId) => {
          const role = rolesById.get(roleId);
          return role ? [{ value: roleId, label: role.name }] : [];
        })}
        onChange={(selected) => onChange(selected.map((option) => option.value))}
      />
      <FieldError id="roleIds-error">{error}</FieldError>
    </Field>
  );
}

type MemberStatusFieldProps = {
  value: MemberFormValues["status"];
  disabled: boolean;
  onBlur: () => void;
  onChange: (status: MemberFormValues["status"]) => void;
};

export function MemberStatusField({ value, disabled, onBlur, onChange }: MemberStatusFieldProps) {
  return (
    <Field>
      <FieldLabel htmlFor="member-status">状态</FieldLabel>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as MemberFormValues["status"])}
        disabled={disabled}
      >
        <SelectTrigger id="member-status" className="w-full" onBlur={onBlur}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">已启用</SelectItem>
          <SelectItem value="disabled">已禁用</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
