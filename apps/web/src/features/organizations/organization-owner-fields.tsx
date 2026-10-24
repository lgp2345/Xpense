import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { OwnerDraft } from "./organization-create-schema";
import { newOwnerDraft } from "./organization-create-schema";

export function OrganizationOwnerFields({
  owners,
  onChange,
  onLookup,
  errors,
  disabled = false,
}: {
  owners: OwnerDraft[];
  onChange: (owners: OwnerDraft[]) => void;
  onLookup: (id: string) => Promise<void>;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const update = (index: number, value: Partial<OwnerDraft>) =>
    onChange(owners.map((owner, i) => (i === index ? { ...owner, ...value } : owner)));
  async function lookup(owner: OwnerDraft) {
    if (checking.has(owner.id) || disabled) return;
    setChecking((previous) => new Set(previous).add(owner.id));
    setLookupErrors((previous) => ({ ...previous, [owner.id]: "" }));
    try {
      await onLookup(owner.id);
    } catch {
      setLookupErrors((previous) => ({
        ...previous,
        [owner.id]: "检查账号失败，请稍后重试。",
      }));
    } finally {
      setChecking((previous) => {
        const next = new Set(previous);
        next.delete(owner.id);
        return next;
      });
    }
  }
  return (
    <section className="space-y-4" aria-labelledby="organization-owners-title">
      <h2 id="organization-owners-title" className="font-semibold text-base">
        组织负责人
      </h2>
      <p className="text-sm text-muted-foreground">
        至少一位负责人。已有账号只关联身份；新账号默认初始密码为 888888。
      </p>
      {owners.map((owner, index) => {
        const phoneId = `owner-${owner.id}-phone`;
        const phoneError = errors[`owners.${index}.phone`] ?? lookupErrors[owner.id];
        return (
          <fieldset
            key={owner.id}
            disabled={disabled}
            className="border-b border-border space-y-3 pb-4"
          >
            <legend className="font-medium text-sm mb-3">负责人</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field className="flex-1">
                <FieldLabel htmlFor={phoneId}>负责人 手机号</FieldLabel>
                <Input
                  id={phoneId}
                  inputMode="tel"
                  autoComplete="off"
                  value={owner.phone}
                  onChange={(event) =>
                    update(index, {
                      phone: event.target.value,
                      checkedPhone: "",
                      candidate: undefined,
                      confirmed: false,
                      email: "",
                      initialPassword: "888888",
                      epoch: owner.epoch + 1,
                    })
                  }
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? `${phoneId}-error` : undefined}
                />
                <FieldError id={`${phoneId}-error`}>{phoneError}</FieldError>
              </Field>
              <Button
                variant="outline"
                aria-busy={checking.has(owner.id)}
                onClick={() => void lookup(owner)}
              >
                {checking.has(owner.id) ? "正在检查…" : "检查账号"}
              </Button>
              {owners.length > 1 ? (
                <Button
                  variant="ghost"
                  onClick={() => onChange(owners.filter((item) => item.id !== owner.id))}
                  aria-label={`移除负责人 ${index + 1}`}
                >
                  移除
                </Button>
              ) : null}
            </div>
            {owner.candidate ? (
              <div className="space-y-2 text-sm">
                <p>
                  {owner.candidate.phone ?? owner.candidate.email} ·{" "}
                  {owner.candidate.status === "active" ? "已有账号" : "已停用，不可关联"}
                </p>
                {owner.candidate.status === "active" ? (
                  <Field>
                    <label htmlFor={`${owner.id}-confirmed`} className="flex gap-2 items-center">
                      <Checkbox
                        id={`${owner.id}-confirmed`}
                        checked={owner.confirmed}
                        onCheckedChange={(confirmed) => update(index, { confirmed })}
                      />
                      关联已有账号
                    </label>
                    <FieldError>{errors[`owners.${index}.confirmed`]}</FieldError>
                  </Field>
                ) : (
                  <p role="alert" className="text-destructive">
                    已停用账号不可关联为负责人
                  </p>
                )}
              </div>
            ) : owner.candidate === null ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${owner.id}-email`}>
                    负责人 {index + 1} 邮箱（选填）
                  </FieldLabel>
                  <Input
                    id={`${owner.id}-email`}
                    type="email"
                    autoComplete="off"
                    value={owner.email}
                    onChange={(event) => update(index, { email: event.target.value })}
                  />
                  <FieldError>{errors[`owners.${index}.email`]}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${owner.id}-password`}>
                    负责人 {index + 1} 初始密码
                  </FieldLabel>
                  <Input
                    id={`${owner.id}-password`}
                    type="password"
                    autoComplete="new-password"
                    value={owner.initialPassword}
                    onChange={(event) => update(index, { initialPassword: event.target.value })}
                  />
                  <FieldError>{errors[`owners.${index}.initialPassword`]}</FieldError>
                </Field>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      <FieldError>{errors.owners}</FieldError>
      <Button variant="outline" onClick={() => onChange([...owners, newOwnerDraft()])}>
        添加负责人
      </Button>
    </section>
  );
}
