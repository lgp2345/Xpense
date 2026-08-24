import type { CategoryNode, CategoryType } from "@xpense/shared";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../../../services/bookkeeping-api";
import { CategoryFormDialog } from "./category-form-dialog";

type CategoryTreeTableProps = {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  disabled: boolean;
  ledgerId: string;
  roots: CategoryNode[];
  type: CategoryType;
  onCreate: (input: CreateCategoryRequest) => Promise<void>;
  onDelete: (category: CategoryNode) => Promise<void>;
  onUpdate: (id: string, input: UpdateCategoryRequest) => Promise<void>;
};

/** 使用表格展示两级分类，子级仅增加缩进。 */
export function CategoryTreeTable(props: CategoryTreeTableProps) {
  const rows = props.roots.flatMap((root) => [root, ...root.children]);
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>分类</TableHead>
              <TableHead>层级</TableHead>
              {props.canCreate || props.canUpdate || props.canDelete ? (
                <TableHead className="text-right">操作</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((category) => {
              const isRoot = category.parentId === null;
              return (
                <TableRow key={category.id}>
                  <TableCell className={isRoot ? "font-medium" : "pl-10 text-muted-foreground"}>
                    {category.name}
                  </TableCell>
                  <TableCell>{isRoot ? "一级" : "二级"}</TableCell>
                  {props.canCreate || props.canUpdate || props.canDelete ? (
                    <TableCell className="flex justify-end gap-2">
                      {props.canCreate && isRoot ? (
                        <CategoryFormDialog
                          initialParent={category}
                          ledgerId={props.ledgerId}
                          rootCategories={props.roots}
                          type={props.type}
                          onCreate={props.onCreate}
                        />
                      ) : null}
                      {props.canUpdate ? (
                        <CategoryFormDialog
                          category={category}
                          ledgerId={props.ledgerId}
                          rootCategories={props.roots}
                          type={props.type}
                          onUpdate={props.onUpdate}
                        />
                      ) : null}
                      {props.canDelete ? (
                        <DeleteCategoryButton
                          category={category}
                          disabled={props.disabled}
                          onDelete={props.onDelete}
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** 删除分类前要求显式确认。 */
function DeleteCategoryButton({
  category,
  disabled,
  onDelete,
}: {
  category: CategoryNode;
  disabled: boolean;
  onDelete: (category: CategoryNode) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除 ${category.name}`}
          disabled={disabled}
          size="sm"
          variant="destructive"
        >
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除分类</AlertDialogTitle>
          <AlertDialogDescription>
            存在子分类或历史交易引用时，服务端会拒绝删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onDelete(category)}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
