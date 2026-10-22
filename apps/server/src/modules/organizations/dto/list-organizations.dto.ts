import { z } from "zod";

/** 将平台组织查询参数转换为有界分页及精确状态筛选。 */
export const listOrganizationsSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  name: z.string().trim().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

/** 经过分页默认值和数字转换后的业务输入。 */
export type ListOrganizationsDto = z.output<typeof listOrganizationsSchema>;
