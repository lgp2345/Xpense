import { useForm, useStore } from "@tanstack/react-form";
import type { OrganizationListQuery } from "@xpense/shared";
import { useEffect } from "react";
import { FilterActions, FilterFields, FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function OrganizationFilters({
  query,
  onApply,
}: {
  query: OrganizationListQuery;
  onApply: (query: OrganizationListQuery) => void;
}) {
  const form = useForm({
    defaultValues: toDraft(query),
    onSubmit: ({ value }) =>
      onApply({
        ...query,
        page: 1,
        name: value.name || undefined,
        status: value.status === "all" ? undefined : value.status,
      }),
  });
  const draft = useStore(form.store, (state) => state.values);
  useEffect(
    () => form.reset({ name: query.name ?? "", status: query.status ?? "all" }),
    [form, query.name, query.status],
  );
  return (
    <FilterPanel>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FilterFields>
          <Field>
            <FieldLabel htmlFor="organization-filter-name">组织名称</FieldLabel>
            <Input
              id="organization-filter-name"
              aria-label="组织名称"
              placeholder="搜索组织名称"
              value={draft.name}
              onChange={(event) => form.setFieldValue("name", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="organization-filter-status">组织状态</FieldLabel>
            <Select
              value={draft.status}
              onValueChange={(value) => form.setFieldValue("status", value as typeof draft.status)}
            >
              <SelectTrigger
                id="organization-filter-status"
                aria-label="组织状态"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="disabled">停用</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              variant="outline"
              onClick={() => {
                form.setFieldValue("name", "");
                form.setFieldValue("status", "all");
                onApply({ ...query, page: 1, name: undefined, status: undefined });
              }}
            >
              重置
            </Button>
          </FilterActions>
        </FilterFields>
      </form>
    </FilterPanel>
  );
}
function toDraft(query: Pick<OrganizationListQuery, "name" | "status">) {
  return { name: query.name ?? "", status: query.status ?? ("all" as const) };
}
