import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const listAuditLogsSchema = z.object({
  action: z.string().trim().min(1).max(120).optional(),
  actorUserId: z.string().uuid().optional(),
  targetType: z.string().trim().min(1).max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export class ListAuditLogsDto extends createZodDto(listAuditLogsSchema) {}
