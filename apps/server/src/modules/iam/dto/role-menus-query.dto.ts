import { z } from "zod";

/** 查询当前组织可用角色的导航菜单，角色标识必须为 UUID。 */
export const roleMenusQuerySchema = z.object({ roleId: z.string().uuid() }).strict();

/** 经过角色菜单查询 schema 校验后的输入。 */
export type RoleMenusQueryDto = z.output<typeof roleMenusQuerySchema>;
