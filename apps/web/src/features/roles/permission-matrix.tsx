import { Checkbox } from "@heroui/react/checkbox";
import type { PermissionKey } from "@xpense/shared";

type MatrixPermission = {
  action: string;
  description?: string;
  key: PermissionKey;
  name: string;
  resource: string;
};

type PermissionMatrixProps = {
  canUpdatePermissions: boolean;
  isEditable?: boolean;
  permissions: readonly MatrixPermission[];
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
    <fieldset aria-label="权限矩阵" className="grid gap-5">
      {Array.from(permissionsByResource, ([resource, resourcePermissions]) => (
        <section key={resource}>
          <h3 className="text-base font-medium text-[var(--color-ink)]">{resource}</h3>
          <div className="mt-2 divide-y divide-[var(--color-line)]">
            {resourcePermissions.map((permission) => (
              <div
                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={permission.key}
              >
                <div>
                  <p className="text-sm text-[var(--color-ink)]">{permission.name}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">{permission.key}</p>
                  {permission.description ? (
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {permission.description}
                    </p>
                  ) : null}
                </div>
                <Checkbox
                  isDisabled={isDisabled}
                  isSelected={selectedKeys.has(permission.key)}
                  onChange={(isSelected) => handleChange(permission.key, isSelected)}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <span className="sr-only">{permission.key}</span>
                  </Checkbox.Content>
                </Checkbox>
              </div>
            ))}
          </div>
        </section>
      ))}
    </fieldset>
  );
}
