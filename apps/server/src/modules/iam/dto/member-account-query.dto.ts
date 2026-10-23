import { chinaPhoneSchema } from "@xpense/shared";
import { z } from "zod";

/** 根据完整手机号查询新增成员时可关联的账号资料。 */
export const memberAccountQuerySchema = z.strictObject({ phone: chinaPhoneSchema });
export type MemberAccountQueryDto = z.output<typeof memberAccountQuerySchema>;
