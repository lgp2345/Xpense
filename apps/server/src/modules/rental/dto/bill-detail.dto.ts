import { z } from "zod";

/** 组织内单张账单详情查询。 */
export const billDetailSchema = z.object({ id: z.string().uuid() }).strict();
export type BillDetailDto = z.output<typeof billDetailSchema>;
