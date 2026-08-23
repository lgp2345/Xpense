import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 删除账户请求校验规则。 */
export const deleteAccountSchema = z.object({ id: z.string().uuid() }).strict();

/** 删除账户请求 DTO。 */
export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}
