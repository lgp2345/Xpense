import { z } from "zod";

/** 删除账户请求校验规则。 */
export const deleteAccountSchema = z.object({ id: z.string().uuid() }).strict();

/** 删除账户请求 DTO，由 deleteAccountSchema 校验并转换。 */
export type DeleteAccountDto = z.output<typeof deleteAccountSchema>;
