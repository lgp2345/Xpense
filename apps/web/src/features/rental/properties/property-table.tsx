import type { RentalPropertyDetail, RentalPropertySummary } from "@xpense/shared";

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
import { Badge } from "@/components/ui/badge";
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
import { PropertyFormDialog } from "./property-form-dialog";

const typeLabels = {
  residential_unit: "住宅",
  detached_house: "独栋住宅",
  apartment_building: "公寓楼",
  commercial_building: "商业楼",
  complex: "园区",
  shop: "商铺",
  office: "办公",
  warehouse: "仓储",
  other: "其他",
} as const;

type PropertyTableProps = {
  getProperty?: (id: string) => Promise<RentalPropertyDetail>;
  canDelete: boolean;
  canCreateContract?: boolean;
  canUpdate: boolean;
  deleting: boolean;
  items: RentalPropertySummary[];
  onDelete: (property: RentalPropertySummary) => Promise<void>;
  onNavigate: (propertyId: string) => void;
  onCreateContract?: (propertyId: string) => void;
  onSetStatus: (property: RentalPropertySummary, isActive: boolean) => Promise<void>;
  onUpdate: (
    input: Parameters<NonNullable<React.ComponentProps<typeof PropertyFormDialog>["onUpdate"]>>[0],
  ) => Promise<void>;
};

/** 大屏房产表格，保留账本标识在数据层而不展示给终端用户。 */
export function PropertyTable({
  getProperty,
  canDelete,
  canCreateContract,
  canUpdate,
  deleting,
  items,
  onDelete,
  onNavigate,
  onCreateContract,
  onSetStatus,
  onUpdate,
}: PropertyTableProps) {
  return (
    <Card className="hidden md:block">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>房产</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>空间</TableHead>
              <TableHead>状态</TableHead>
              {canUpdate || canDelete || canCreateContract ? (
                <TableHead className="text-right">操作</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((property) => (
              <TableRow key={property.id}>
                <TableCell className="font-medium">
                  <a
                    href={`/rentals/properties/${property.id}`}
                    className="text-left underline-offset-4 hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(property.id);
                    }}
                  >
                    {property.name}
                  </a>
                </TableCell>
                <TableCell>{propertyTypeLabel(property)}</TableCell>
                <TableCell className="max-w-64 truncate" title={propertyAddress(property)}>
                  {propertyAddress(property)}
                </TableCell>
                <TableCell>{spaceSummary(property)}</TableCell>
                <TableCell>
                  <StatusBadge active={property.isActive} />
                </TableCell>
                {canUpdate || canDelete || canCreateContract ? (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {canUpdate ? (
                        <>
                          <PropertyFormDialog
                            property={property}
                            loadDetail={getProperty ? () => getProperty(property.id) : undefined}
                            onUpdate={onUpdate}
                          />
                          <Button
                            aria-label={`${property.isActive ? "停用" : "启用"} ${property.name}`}
                            size="sm"
                            variant="outline"
                            onClick={() => void onSetStatus(property, !property.isActive)}
                          >
                            {property.isActive ? "停用" : "启用"}
                          </Button>
                        </>
                      ) : null}
                      {canDelete ? (
                        <DeletePropertyButton
                          disabled={deleting}
                          property={property}
                          onDelete={onDelete}
                        />
                      ) : null}
                      {canCreateContract && property.isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onCreateContract?.(property.id)}
                        >
                          新建合同
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DeletePropertyButton({
  disabled,
  property,
  onDelete,
}: {
  disabled: boolean;
  property: RentalPropertySummary;
  onDelete: (property: RentalPropertySummary) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除 ${property.name}`}
          disabled={disabled}
          size="sm"
          variant="destructive"
        >
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除房产</AlertDialogTitle>
          <AlertDialogDescription>删除前请确保没有空间或账务关联。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onDelete(property)}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function propertyTypeLabel(
  property: Pick<RentalPropertySummary, "type" | "customTypeName">,
): string {
  return property.type === "other" && property.customTypeName
    ? property.customTypeName
    : typeLabels[property.type];
}
export function propertyAddress(
  property: Pick<RentalPropertySummary, "province" | "city" | "district" | "addressLine">,
): string {
  return [property.province, property.city, property.district, property.addressLine]
    .filter(Boolean)
    .join(" ");
}
export function spaceSummary(
  property: Pick<RentalPropertySummary, "spaceCount" | "rentableSpaceCount">,
): string {
  return `共 ${property.spaceCount} 个空间，可出租 ${property.rentableSpaceCount} 个`;
}
function StatusBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "default" : "secondary"}>{active ? "启用" : "停用"}</Badge>;
}
