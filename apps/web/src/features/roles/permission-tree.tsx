import type { PermissionKey, PermissionTreeNode } from "@xpense/shared";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getPermissionNodeState, togglePermissionNode } from "./permission-tree-state";

type PermissionTreeProps = {
  disabled?: boolean;
  nodes: readonly PermissionTreeNode[];
  selected: readonly PermissionKey[];
  onChange: (permissionKeys: PermissionKey[]) => void;
};

export function PermissionTree({
  disabled = false,
  nodes,
  selected,
  onChange,
}: PermissionTreeProps) {
  if (nodes.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">当前没有可授予的权限。</p>;
  }

  return (
    <ul aria-label="角色权限" className="max-h-96 divide-y overflow-y-auto rounded-lg border">
      {nodes.map((node) => (
        <PermissionTreeItem
          disabled={disabled}
          key={getNodeKey(node)}
          node={node}
          roots={nodes}
          selected={selected}
          onChange={onChange}
        />
      ))}
    </ul>
  );
}

type PermissionTreeItemProps = {
  disabled: boolean;
  node: PermissionTreeNode;
  roots: readonly PermissionTreeNode[];
  selected: readonly PermissionKey[];
  onChange: (permissionKeys: PermissionKey[]) => void;
};

function PermissionTreeItem({
  disabled,
  node,
  roots,
  selected,
  onChange,
}: PermissionTreeItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const state = getPermissionNodeState(node, selected);
  const checked = state === "indeterminate" ? "indeterminate" : state === "checked";
  const ariaChecked = state === "indeterminate" ? "mixed" : state === "checked";
  const hasChildren = node.children.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <li>
        <div className="flex min-h-10 items-center gap-3 px-3 py-2">
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <button
                aria-label={`${isOpen ? "折叠" : "展开"} ${node.name}`}
                className="group/permission-toggle flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                type="button"
              >
                <ChevronRight className="size-4 transition-transform duration-200 ease-out motion-reduce:transition-none group-data-[state=open]/permission-toggle:rotate-90" />
              </button>
            </CollapsibleTrigger>
          ) : null}
          <Checkbox
            aria-label={node.name}
            aria-checked={ariaChecked}
            checked={checked}
            className="relative data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground [&[data-state=indeterminate]_svg]:hidden data-[state=indeterminate]:before:absolute data-[state=indeterminate]:before:h-0.5 data-[state=indeterminate]:before:w-2.5 data-[state=indeterminate]:before:rounded-full data-[state=indeterminate]:before:bg-current"
            disabled={disabled}
            onCheckedChange={(nextChecked) =>
              onChange(togglePermissionNode(roots, node, selected, nextChecked === true))
            }
          />
          <div className="min-w-0 flex-1">
            <p className={node.type === "directory" ? "text-sm font-medium" : "text-sm"}>
              {node.name}
            </p>
            {node.permissionCode !== null ? (
              <p className="text-xs text-muted-foreground">{node.permissionCode}</p>
            ) : null}
          </div>
          {node.type === "button" ? (
            <span className="text-xs text-muted-foreground">按钮</span>
          ) : null}
        </div>
        {hasChildren ? (
          <CollapsibleContent asChild>
            <ul aria-label={`${node.name}的子权限`} className="ml-5 border-l pl-3">
              {node.children.map((child) => (
                <PermissionTreeItem
                  disabled={disabled}
                  key={getNodeKey(child)}
                  node={child}
                  roots={roots}
                  selected={selected}
                  onChange={onChange}
                />
              ))}
            </ul>
          </CollapsibleContent>
        ) : null}
      </li>
    </Collapsible>
  );
}

function getNodeKey(node: PermissionTreeNode): string {
  return node.id === null ? `${node.type}:${node.name}` : `${node.type}:${node.id}`;
}
