import { rentalContractDisplayStatuses } from "@xpense/shared";
import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

const optionalQueryText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional(),
  );

/** 租赁合同列表查询校验规则。 */
export const listContractsSchema = z
  .object({
    keyword: optionalQueryText(200),
    propertyId: z.string().uuid().optional(),
    tenantId: z.string().uuid().optional(),
    status: z.enum(rentalContractDisplayStatuses).optional(),
    startDateFrom: contractCalendarDateSchema.optional(),
    startDateTo: contractCalendarDateSchema.optional(),
    endDateFrom: contractCalendarDateSchema.optional(),
    endDateTo: contractCalendarDateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDateFrom && value.startDateTo && value.startDateFrom > value.startDateTo) {
      context.addIssue({ code: "custom", message: "合同开始日期筛选区间无效" });
    }
    if (value.endDateFrom && value.endDateTo && value.endDateFrom > value.endDateTo) {
      context.addIssue({ code: "custom", message: "合同结束日期筛选区间无效" });
    }
  });

/** 租赁合同列表查询 DTO，由 listContractsSchema 校验并转换。 */
export type ListContractsDto = z.output<typeof listContractsSchema>;

export const listRentalContractsSchema = listContractsSchema;
export type { ListContractsDto as ListRentalContractsDto };
