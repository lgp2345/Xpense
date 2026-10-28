import { useForm } from "@tanstack/react-form";
import { FilterActions, FilterFields, FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MenuSearch } from "./menu-search";

const fields = [
  { key: "name", label: "菜单名称", placeholder: "输入名称关键词" },
  { key: "destination", label: "路由或外链", placeholder: "输入路由路径、标识或外链" },
  { key: "permission", label: "权限标识", placeholder: "例如 members:read" },
] as const;

export function MenuFilters({
  search,
  onApply,
}: {
  search: MenuSearch;
  onApply: (search: MenuSearch) => void;
}) {
  const form = useForm({
    defaultValues: {
      name: search.name ?? "",
      destination: search.destination ?? "",
      permission: search.permission ?? "",
    },
    onSubmit: ({ value }) => {
      onApply(
        Object.fromEntries(
          Object.entries(value)
            .map(([key, input]) => [key, input.trim()])
            .filter(([, input]) => input),
        ),
      );
    },
  });

  return (
    <FilterPanel>
      <form
        aria-label="筛选菜单"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FilterFields>
          {fields.map(({ key, label, placeholder }) => (
            <form.Field key={key} name={key}>
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={`menu-filter-${key}`}>{label}</FieldLabel>
                  <Input
                    id={`menu-filter-${key}`}
                    placeholder={placeholder}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                </Field>
              )}
            </form.Field>
          ))}
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              variant="outline"
              onClick={() => {
                form.reset({ name: "", destination: "", permission: "" });
                onApply({});
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
