import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Select } from "@heroui/react/select";
import { useState } from "react";

import styles from "./organization-switcher.module.css";

export type OrganizationOption = {
  id: string;
  name: string;
};

type OrganizationSwitcherProps = {
  currentOrganizationId: string | null;
  isDisabled?: boolean;
  organizations: OrganizationOption[];
  onSwitch: (organizationId: string) => Promise<void> | void;
};

export function OrganizationSwitcher({
  currentOrganizationId,
  isDisabled = false,
  organizations,
  onSwitch,
}: OrganizationSwitcherProps) {
  const [isSwitching, setIsSwitching] = useState(false);

  async function handleChange(organizationId: string | number | null) {
    if (organizationId === null || organizationId === currentOrganizationId || isSwitching) {
      return;
    }

    setIsSwitching(true);

    try {
      await onSwitch(String(organizationId));
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <Select
      aria-label="当前组织"
      className={styles.organizationSwitcher}
      isDisabled={isDisabled || isSwitching || organizations.length < 2}
      placeholder="未选择组织"
      value={currentOrganizationId}
      onChange={handleChange}
    >
      <Label>当前组织</Label>
      <Select.Trigger className={styles.trigger}>
        <Select.Value className={styles.value} />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className={styles.popover}>
        <ListBox>
          {organizations.map((organization) => (
            <ListBox.Item
              className={styles.option}
              id={organization.id}
              key={organization.id}
              textValue={organization.name}
            >
              <span className={styles.optionText} title={organization.name}>
                {organization.name}
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
