import { z } from "zod";

export const resetOrganizationMenusSchema = z
  .object({
    organizationId: z.string().uuid(),
  })
  .strict();

/** 经过 resetOrganizationMenusSchema 校验并转换后的业务输入。 */
export type ResetOrganizationMenusDto = z.output<typeof resetOrganizationMenusSchema>;
