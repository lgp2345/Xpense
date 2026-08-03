import type { PermissionKey } from "@xpense/shared";

import { Checkbox } from "@/components/ui/checkbox";
import type { IamPermission } from "../../services/iam-api";

type PermissionMatrixProps = {
  canUpdatePermissions: boolean;
  isEditable?: boolean;
  permissions: readonly IamPermission[];
  selected: readonly PermissionKey[];
  onChange: (permissionKeys: PermissionKey[]) => void;
};

export function PermissionMatrix({
  canUpdatePermissions,
  isEditable = true,
  permissions,
  selected,
  onChange,
}: PermissionMatrixProps) {
  const selectedKeys = new Set(selected);
  const isDisabled = !canUpdatePermissions || !isEditable;
  const permissionsByResource = Map.groupBy(permissions, (permission) => permission.resource);

  function handleChange(permissionKey: PermissionKey, isSelected: boolean) {
    onChange(
      isSelected
        ? [...selected, permissionKey]
        : selected.filter((selectedKey) => selectedKey !== permissionKey),
    );
  }

  return (
    <div className="grid gap-6">
      {Array.from(permissionsByResource, ([resource, resourcePermissions]) => (
        <fieldset key={resource} className="grid gap-3">
          <legend className="text-base font-medium">{resource}</legend>
          <div className="divide-y rounded-lg border">
            {resourcePermissions.map((permission) => (
              <div
                className="flex items-center justify-between gap-4 px-4 py-3"
                key={permission.key}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{permission.name}</p>
                  <p className="text-xs text-muted-foreground">{permission.key}</p>
                  {permission.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{permission.description}</p>
                  ) : null}
                </div>
                <Checkbox
                  aria-label={permission.name}
                  checked={selectedKeys.has(permission.key)}
                  disabled={isDisabled}
                  onCheckedChange={(checked) => handleChange(permission.key, checked === true)}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
