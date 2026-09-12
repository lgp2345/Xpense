import { z } from "zod";

/** 删除租赁房产请求校验规则。 */
export const deletePropertySchema = z.object({ id: z.string().uuid() }).strict();

/** 删除租赁房产请求 DTO，由 deletePropertySchema 校验并转换。 */
export type DeletePropertyDto = z.output<typeof deletePropertySchema>;

/** 兼容按资源名称命名的 DTO 导出。 */
export const deleteRentalPropertySchema = deletePropertySchema;
export type { DeletePropertyDto as DeleteRentalPropertyDto };
