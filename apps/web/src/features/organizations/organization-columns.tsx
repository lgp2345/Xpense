import type { OrganizationDetail } from "@xpense/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function OrganizationActions({
  organization,
  onDetail,
  onEnter,
  pending = false,
}: {
  organization: OrganizationDetail;
  onDetail?: () => void;
  onEnter: () => void;
  pending?: boolean;
}) {
  const reason =
    organization.status === "disabled"
      ? "停用组织不可进入"
      : pending
        ? "正在切换组织，请稍候"
        : null;
  const enter = (
    <Button
      size="sm"
      disabled={Boolean(reason)}
      focusableWhenDisabled
      aria-busy={pending}
      onClick={onEnter}
    >
      进入组织
    </Button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {onDetail ? (
        <Button size="sm" variant="outline" onClick={onDetail}>
          详情
        </Button>
      ) : null}
      {reason ? (
        <Tooltip>
          <TooltipTrigger render={enter} />
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      ) : (
        enter
      )}
    </div>
  );
}
export function OrganizationRow({
  organization,
  onDetail,
  onEnter,
  pending,
}: {
  organization: OrganizationDetail;
  onDetail: () => void;
  onEnter: () => void;
  pending: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="max-w-72 whitespace-normal break-words font-medium">
        {organization.name}
      </TableCell>
      <TableCell>{organization.baseCurrency}</TableCell>
      <TableCell>
        <Badge variant={organization.status === "active" ? "secondary" : "outline"}>
          {organization.status === "active" ? "启用" : "停用"}
        </Badge>
      </TableCell>
      <TableCell className="max-w-64 whitespace-normal break-words">
        {organization.owners
          .map((owner) => owner.phone ?? owner.email ?? "未填写联系方式")
          .join("、") || "无有效负责人"}
      </TableCell>
      <TableCell>
        <OrganizationActions
          organization={organization}
          onDetail={onDetail}
          onEnter={onEnter}
          pending={pending}
        />
      </TableCell>
    </TableRow>
  );
}
