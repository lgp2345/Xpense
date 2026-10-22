import { z } from "zod";

/** 显式切换当前会话目标，不接受客户端伪造其他身份字段。 */
export const switchOrganizationSchema = z.strictObject({
  organizationId: z.string().uuid(),
});

/** 经过 switchOrganizationSchema 校验并转换后的业务输入。 */
export type SwitchOrganizationDto = z.output<typeof switchOrganizationSchema>;
