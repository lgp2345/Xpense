import { rentalBillStatuses, rentalBillTypes } from "@xpense/shared";
import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 组织内应收查询，默认仅展示有效账单，有界分页。 */
export const listBillsSchema = z
  .object({
    contractId: z.string().uuid().optional(),
    propertyId: z.string().uuid().optional(),
    keyword: z.preprocess(
      (value) => (typeof value === "string" && !value.trim() ? undefined : value),
      z.string().trim().min(1).max(200).optional(),
    ),
    type: z.enum(rentalBillTypes).optional(),
    status: z.enum(rentalBillStatuses).default("active"),
    dueDateFrom: contractCalendarDateSchema.optional(),
    dueDateTo: contractCalendarDateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueDateFrom && value.dueDateTo && value.dueDateFrom > value.dueDateTo) {
      context.addIssue({ code: "custom", message: "账单到期日期筛选区间无效" });
    }
  });

/** 账单列表查询输入。 */
export type ListBillsDto = z.output<typeof listBillsSchema>;
