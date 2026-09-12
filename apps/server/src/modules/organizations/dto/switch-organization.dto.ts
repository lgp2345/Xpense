import { z } from "zod";

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});

/** 经过 switchOrganizationSchema 校验并转换后的业务输入。 */
export type SwitchOrganizationDto = z.output<typeof switchOrganizationSchema>;
