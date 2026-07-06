import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});

export class SwitchOrganizationDto extends createZodDto(switchOrganizationSchema) {}
