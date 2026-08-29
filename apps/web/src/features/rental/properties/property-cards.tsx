import type { RentalPropertyDetail, RentalPropertySummary } from "@xpense/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PropertyFormDialog } from "./property-form-dialog";
import {
  DeletePropertyButton,
  propertyAddress,
  propertyTypeLabel,
  spaceSummary,
} from "./property-table";

type PropertyCardsProps = {
  getProperty?: (id: string) => Promise<RentalPropertyDetail>;
  canDelete: boolean;
  canUpdate: boolean;
  deleting: boolean;
  items: RentalPropertySummary[];
  onDelete: (property: RentalPropertySummary) => Promise<void>;
  onNavigate: (propertyId: string) => void;
  onSetStatus: (property: RentalPropertySummary, isActive: boolean) => Promise<void>;
  onUpdate: (
    input: Parameters<NonNullable<React.ComponentProps<typeof PropertyFormDialog>["onUpdate"]>>[0],
  ) => Promise<void>;
};

/** 小屏房产摘要卡片，与表格使用相同的权限和写入操作。 */
export function PropertyCards({
  getProperty,
  canDelete,
  canUpdate,
  deleting,
  items,
  onDelete,
  onNavigate,
  onSetStatus,
  onUpdate,
}: PropertyCardsProps) {
  return (
    <div className="grid gap-3 md:hidden" data-testid="property-cards">
      {items.map((property) => (
        <Card key={property.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <a
                  href={`/rentals/properties/${property.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(property.id);
                  }}
                >
                  {property.name}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">{propertyTypeLabel(property)}</p>
              </div>
              <Badge variant={property.isActive ? "default" : "secondary"}>
                {property.isActive ? "启用" : "停用"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{propertyAddress(property)}</p>
            <p className="text-sm">{spaceSummary(property)}</p>
            {canUpdate || canDelete ? (
              <div className="flex flex-wrap gap-2">
                {canUpdate ? (
                  <>
                    <PropertyFormDialog
                      property={property}
                      loadDetail={getProperty ? () => getProperty(property.id) : undefined}
                      onUpdate={onUpdate}
                    />
                    <button
                      type="button"
                      aria-label={`${property.isActive ? "停用" : "启用"} ${property.name}`}
                      className="rounded-md border px-3 py-1.5 text-sm"
                      onClick={() => void onSetStatus(property, !property.isActive)}
                    >
                      {property.isActive ? "停用" : "启用"}
                    </button>
                  </>
                ) : null}
                {canDelete ? (
                  <DeletePropertyButton
                    disabled={deleting}
                    property={property}
                    onDelete={onDelete}
                  />
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
