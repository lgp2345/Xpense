import type { RentalLeaseStatus } from "@xpense/shared";
import type { ListRentalContractsQuery } from "../../../services/rental-api";

/** 房产详情的合同及空间筛选，分别使用各自的关键词和状态。 */
export type PropertyDetailSearch = Omit<
  ListRentalContractsQuery,
  "propertyId" | "tenantId" | "spaceId" | "spaceScope" | "currentOnly"
> & {
  view?: "billing";
  spaceKeyword?: string;
  spaceEffectiveStatus?: "active" | "inactive";
  spaceLeaseStatus?: RentalLeaseStatus;
};
