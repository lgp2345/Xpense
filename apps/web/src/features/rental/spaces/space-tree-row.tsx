import type { RentalSpaceNode } from '@xpense/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type RefCallback, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { TableCell, TableRow } from '@/components/ui/table'
import { spaceTypeOptions } from './space-form-schema'

const spaceTypeLabels = new Map(spaceTypeOptions)

export function SpaceTreeRow({
  depth,
  expanded,
  node,
  actions,
  onToggle,
  onViewContracts,
  rowRef,
}: {
  depth: number
  expanded: boolean
  node: RentalSpaceNode
  actions?: React.ReactNode
  onToggle: () => void
  onViewContracts?: () => void
  rowRef?: RefCallback<HTMLTableRowElement>
}) {
  const status = !node.isActive
    ? '自身停用'
    : !node.isEffectivelyActive
      ? '因上级停用而不可用'
      : '有效'
  return (
    <TableRow ref={rowRef} id={`space-row-${node.id}`} tabIndex={-1}>
      <TableCell>
        <div
          className="flex min-w-0 gap-1 items-center"
          style={{ paddingInlineStart: `${depth * 1.25}rem` }}
        >
          {node.hasChildren ? (
            <Button
              aria-expanded={expanded}
              aria-label={`${expanded ? '折叠' : '展开'} ${node.name}`}
              className="size-7"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onToggle}
            >
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          ) : (
            <span aria-hidden="true" className="inline-block size-7" />
          )}
          <span className="font-medium min-w-0 break-words">{node.name}</span>
          {node.code ? (
            <span className="text-xs text-muted-foreground break-all">
              {node.code}
            </span>
          ) : null}
          <MobileSpaceDetails node={node} onViewContracts={onViewContracts} />
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {node.customTypeName ?? spaceTypeLabels.get(node.type)}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          <Badge variant={node.isEffectivelyActive ? 'default' : 'secondary'}>
            {status}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          <SpaceLeaseBadge node={node} onViewContracts={onViewContracts} />
          {node.hasUpcomingContract ? (
            <Badge variant="secondary">即将有合同</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant={node.isRentable ? 'outline' : 'secondary'}>
          {node.isRentable ? '允许出租' : '不允许出租'}
        </Badge>
      </TableCell>
      {actions ? <TableCell>{actions}</TableCell> : null}
    </TableRow>
  )
}

function MobileSpaceDetails({
  node,
  onViewContracts,
}: {
  node: RentalSpaceNode
  onViewContracts?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            className="sm:hidden"
            size="sm"
            type="button"
            variant="outline"
          >
            详情
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{node.name}</SheetTitle>
          <SheetDescription>空间详情</SheetDescription>
        </SheetHeader>
        <div className="text-sm grid px-4 gap-2">
          <p>类型：{node.customTypeName ?? spaceTypeLabels.get(node.type)}</p>
          <p>状态：{node.isActive ? '自身启用' : '自身停用'}</p>
          <p>
            {!node.isActive
              ? '自身停用'
              : !node.isEffectivelyActive
                ? '因上级停用而不可用'
                : '当前可用'}
          </p>
          <div className="flex gap-1 items-center">
            <span>租赁状态：</span>
            <SpaceLeaseBadge
              node={node}
              onViewContracts={
                onViewContracts
                  ? () => {
                      setOpen(false)
                      onViewContracts()
                    }
                  : undefined
              }
            />
          </div>
          <p>
            {node.hasUpcomingContract ? '有即将生效合同' : '无即将生效合同'}
          </p>
          <p>出租属性：{node.isRentable ? '允许出租' : '不允许出租'}</p>
          {node.note ? <p>备注：{node.note}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SpaceLeaseBadge({
  node,
  onViewContracts,
}: {
  node: RentalSpaceNode
  onViewContracts?: () => void
}) {
  const interactive =
    onViewContracts &&
    (node.leaseStatus === 'active' || node.leaseStatus === 'expiring_soon')
  return (
    <Badge
      variant={node.leaseStatus === 'vacant' ? 'outline' : 'secondary'}
      render={
        interactive ? (
          <button
            type="button"
            aria-label={`查看 ${node.name} 的合同`}
            onClick={onViewContracts}
          />
        ) : undefined
      }
      className={
        interactive
          ? 'cursor-pointer outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50'
          : undefined
      }
    >
      {leaseStatusLabel(node.leaseStatus)}
      {interactive ? (
        <ChevronRight aria-hidden="true" className="size-3" />
      ) : null}
    </Badge>
  )
}

function leaseStatusLabel(status: RentalSpaceNode['leaseStatus']): string {
  return {
    vacant: '空置',
    upcoming: '即将出租',
    active: '出租中',
    expiring_soon: '即将到期',
  }[status]
}
