import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { DataTableToolbar } from "./toolbar";
import { type ClientColumnDef, useClientTable } from "./use-client-table";

const data = [{ role: "admin" }, { role: "member" }];
const columns: ClientColumnDef<(typeof data)[number]>[] = [
  {
    accessorKey: "role",
    filterFn: (row, id, values: string[] | string) => values.includes(row.getValue(id)),
  },
];
function Harness({ searchKey }: { searchKey?: string }) {
  const table = useClientTable(data, columns);
  return (
    <>
      <DataTableToolbar
        table={table}
        searchKey={searchKey}
        filters={[
          {
            columnId: "role",
            title: "角色",
            options: [
              { label: "管理员", value: "admin" },
              { label: "普通成员", value: "member" },
            ],
          },
        ]}
      />
      <output aria-label="筛选结果">{table.getFilteredRowModel().rows.length}</output>
    </>
  );
}
it("多选仅查询后生效，关联字段标签后仍向读屏提供已选项，重置恢复结果", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const filter = screen.getByRole("button", { name: "角色" });
  await user.click(filter);
  await user.click(screen.getByRole("option", { name: /管理员/ }));
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("2");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("1");
  await user.click(filter);
  await user.click(screen.getByRole("option", { name: /普通成员/ }));
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("1");
  await user.keyboard("{Escape}");
  expect(filter).toHaveAccessibleDescription("已选择：管理员、普通成员");
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(filter).toHaveAccessibleDescription("未选择筛选条件");
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("2");
});

it.each([
  undefined,
  "role",
])("关键词 %s 修改后仅在查询或回车提交时过滤，重置清除草稿和结果", async (searchKey) => {
  const user = userEvent.setup();
  render(<Harness searchKey={searchKey} />);
  expect(screen.getByRole("button", { name: "查询" })).toBeVisible();
  expect(screen.getByRole("button", { name: "重置" })).toBeVisible();
  const input = screen.getByRole("textbox", { name: "关键词" });
  await user.type(input, "admin");
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("2");
  await user.keyboard("{Enter}");
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("1");
  await user.clear(input);
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("1");
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(input).toHaveValue("");
  expect(screen.getByLabelText("筛选结果")).toHaveTextContent("2");
});
