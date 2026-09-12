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

/** 经过 listAuditLogsSchema 校验并转换后的业务输入。 */
export type ListAuditLogsDto = z.output<typeof listAuditLogsSchema>;
