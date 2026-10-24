import type { PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import type { IamMember, IamMemberAccount, IamRole } from "../../services/iam-api";
import { MemberFormContent } from "./member-form-content";
import type { MemberFormValues } from "./member-form-schema";

export type MemberFormDialogProps = {
  roles: IamRole[];
  disabled?: boolean;
  onSubmit: (input: MemberFormValues) => Promise<void>;
} & (
  | {
      member?: undefined;
      permissions?: never;
      onLookupAccount: (phone: string) => Promise<IamMemberAccount | null>;
    }
  | { member: IamMember; permissions: readonly PermissionKey[]; onLookupAccount?: never }
);

export function MemberFormDialog(props: MemberFormDialogProps) {
  const [open, setOpen] = useState(false);
  const { member, disabled = false } = props;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            disabled={disabled}
            variant={member ? "outline" : "default"}
            aria-label={member ? `编辑 ${member.email ?? member.phone ?? "未填写"}` : undefined}
          >
            {member ? "编辑" : "新增成员"}
          </Button>
        }
      />
      {open ? <MemberFormContent {...props} onClose={() => setOpen(false)} /> : null}
    </Dialog>
  );
}
