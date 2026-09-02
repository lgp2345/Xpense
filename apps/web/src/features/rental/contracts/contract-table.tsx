import type { RentalContractSummary } from "@xpense/shared";

import { ContractStatusBadge } from "./contract-status";

export function ContractTable({
  items,
  onNavigate,
}: {
  items: RentalContractSummary[];
  onNavigate: (contractId: string) => void;
}) {
  return (
    <div data-testid="contract-table" className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-3">合同</th>
            <th className="p-3">房产 / 空间</th>
            <th className="p-3">租期</th>
            <th className="p-3">租金</th>
            <th className="p-3">承租方</th>
            <th className="p-3">状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="p-3">
                <ContractLink item={item} onNavigate={onNavigate} />
              </td>
              <td className="p-3">
                {item.propertyName} · {item.spaceNames.join("、") || "未指定空间"}
              </td>
              <td className="p-3">
                {item.startDate ?? "未开始"} 至 {item.endDate ?? "未结束"}
              </td>
              <td className="p-3">{formatMoney(item.rentAmountMinor)}</td>
              <td className="p-3">{item.tenantNames.join("、") || "未指定承租方"}</td>
              <td className="p-3">
                <ContractStatusBadge status={item.displayStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContractLink({
  item,
  onNavigate,
}: {
  item: RentalContractSummary;
  onNavigate: (id: string) => void;
}) {
  return (
    <a
      href={`/rentals/contracts/${item.id}`}
      className="font-medium underline-offset-4 hover:underline"
      onClick={(event) => {
        event.preventDefault();
        onNavigate(item.id);
      }}
    >
      {item.contractNumber}
    </a>
  );
}

export function formatMoney(amount: number | null): string {
  return amount === null
    ? "未设置"
    : `¥${(amount / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}
