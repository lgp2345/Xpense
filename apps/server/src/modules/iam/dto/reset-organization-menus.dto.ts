import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const resetOrganizationMenusSchema = z
  .object({
    organizationId: z.string().uuid(),
  })
  .strict();

export class ResetOrganizationMenusDto extends createZodDto(resetOrganizationMenusSchema) {}
