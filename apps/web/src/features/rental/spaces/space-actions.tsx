import type {
  BatchCreateRentalSpacesRequest,
  CreateRentalSpaceRequest,
  PermissionKey,
  RentalSpaceNode,
  UpdateRentalSpaceRequest,
} from "@xpense/shared";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { RentalApi } from "../../../services/rental-api";
import { SpaceBatchDialog } from "./space-batch-dialog";
import { SpaceFormDialog } from "./space-form-dialog";
import { SpaceMoveDialog } from "./space-move-dialog";

type SpaceActionsProps = {
  api: Pick<RentalApi, "getSpaceSubtreeDepth" | "listChildren">;
  deleting: boolean;
  organizationId: string;
  permissions: readonly PermissionKey[];
  propertyActive: boolean;
  propertyId: string;
  space: RentalSpaceNode;
  depth: number;
  onCreate: (input: CreateRentalSpaceRequest) => Promise<void>;
  onBatchCreate: (input: BatchCreateRentalSpacesRequest) => Promise<void>;
  onDelete: (space: RentalSpaceNode) => Promise<void>;
  onMove: (space: RentalSpaceNode, parentId: string | null, sortOrder: number) => Promise<void>;
  onSetStatus: (space: RentalSpaceNode, isActive: boolean) => Promise<void>;
  onUpdate: (input: UpdateRentalSpaceRequest) => Promise<void>;
};

/** 按权限和房产状态显示空间写操作；窄屏把次要资料移入详情抽屉。 */
export function SpaceActions({
  api,
  deleting,
  organizationId,
  permissions,
  propertyActive,
  propertyId,
  space,
  depth,
  onCreate,
  onBatchCreate,
  onDelete,
  onMove,
  onSetStatus,
  onUpdate,
}: SpaceActionsProps) {
  const canCreate = propertyActive && depth < 3 && permissions.includes("rental_spaces:create");
  const canUpdate = permissions.includes("rental_spaces:update");
  const canDelete = permissions.includes("rental_spaces:delete");
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <SpaceDetailsSheet space={space} />
      {canCreate ? (
        <SpaceBatchDialog propertyId={propertyId} parentId={space.id} onCreate={onBatchCreate} />
      ) : null}
      {canCreate ? (
        <SpaceFormDialog
          parentId={space.id}
          propertyId={propertyId}
          onCreate={onCreate}
          trigger={
            <Button aria-label={`在 ${space.name} 下新增`} size="sm" variant="outline">
              新增子空间
            </Button>
          }
        />
      ) : null}
      {canUpdate ? (
        <SpaceFormDialog propertyId={propertyId} space={space} onUpdate={onUpdate} />
      ) : null}
      {canUpdate && propertyActive ? (
        <SpaceMoveDialog
          api={api}
          organizationId={organizationId}
          propertyId={propertyId}
          space={space}
          onMove={(parentId, sortOrder) => onMove(space, parentId, sortOrder)}
        />
      ) : null}
      {canUpdate ? <SetSpaceStatusButton space={space} onSetStatus={onSetStatus} /> : null}
      {canDelete ? (
        <DeleteSpaceButton disabled={deleting} space={space} onDelete={onDelete} />
      ) : null}
    </div>
  );
}

function SpaceDetailsSheet({ space }: { space: RentalSpaceNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="sm:hidden" size="sm" variant="outline">
          详情
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{space.name}</SheetTitle>
          <SheetDescription>空间详情</SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4 text-sm">
          <p>类型：{space.customTypeName ?? space.type}</p>
          <p>状态：{space.isActive ? "自身启用" : "自身停用"}</p>
          <p>
            {!space.isActive
              ? "自身停用"
              : !space.isEffectivelyActive
                ? "因上级停用而不可用"
                : "当前可用"}
          </p>
          <p>{space.isRentable ? "可出租" : "不可出租"}</p>
          {space.note ? <p>备注：{space.note}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SetSpaceStatusButton({
  space,
  onSetStatus,
}: {
  space: RentalSpaceNode;
  onSetStatus: (space: RentalSpaceNode, isActive: boolean) => Promise<void>;
}) {
  const isActivating = !space.isActive;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`${isActivating ? "启用" : "停用"} ${space.name}`}
          size="sm"
          variant="outline"
        >
          {isActivating ? "启用" : "停用"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isActivating ? "确认启用空间" : "确认停用空间"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isActivating
              ? "启用后仍会受到上级空间和房产状态影响。"
              : "停用仅改变该空间自身状态；其已启用后代会因上级停用而暂时不可用。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onSetStatus(space, isActivating)}>
            确认{isActivating ? "启用" : "停用"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteSpaceButton({
  disabled,
  space,
  onDelete,
}: {
  disabled: boolean;
  space: RentalSpaceNode;
  onDelete: (space: RentalSpaceNode) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除 ${space.name}`}
          disabled={disabled}
          size="sm"
          variant="destructive"
        >
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除空间</AlertDialogTitle>
          <AlertDialogDescription>删除前请确保该空间没有子空间或租赁关联。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onDelete(space)}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
