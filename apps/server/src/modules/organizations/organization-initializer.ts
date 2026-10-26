import { Injectable } from "@nestjs/common";
import type { AppDbExecutor } from "../../db/db.module.js";
import { copyMenuTemplate } from "../iam/menu-template.js";
import { createMenuTemplateExecutor } from "../iam/menu-template-executor.js";

/** 创建组织的菜单沿用同一事务，初始化失败由调用方回滚。 */
export async function initializeOrganization(
  tx: AppDbExecutor,
  organizationId: string,
): Promise<void> {
  await copyMenuTemplate(organizationId, createMenuTemplateExecutor(tx));
}

@Injectable()
export class OrganizationInitializer {
  initialize = initializeOrganization;
}
