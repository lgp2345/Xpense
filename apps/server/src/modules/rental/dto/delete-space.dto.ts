import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 删除租赁空间请求校验规则。 */
export const deleteSpaceSchema = z.object({ id: z.string().uuid() }).strict();

/** 删除租赁空间请求 DTO。 */
export class DeleteSpaceDto extends createZodDto(deleteSpaceSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const deleteRentalSpaceSchema = deleteSpaceSchema;
export { DeleteSpaceDto as DeleteRentalSpaceDto };
