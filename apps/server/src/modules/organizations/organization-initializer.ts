import { Injectable } from "@nestjs/common";
import { initializeBookkeepingDefaults } from "../../db/bookkeeping-defaults.js";
import { createBookkeepingDefaultsExecutor } from "../../db/bookkeeping-defaults-executor.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { copyMenuTemplate } from "../iam/menu-template.js";
import { createMenuTemplateExecutor } from "../iam/menu-template-executor.js";

/** 创建组织的记账数据和菜单沿用同一事务，任一初始化失败由调用方回滚。 */
export async function initializeOrganization(
  tx: AppDbExecutor,
  organizationId: string,
  actorUserId: string,
): Promise<void> {
  await initializeBookkeepingDefaults(createBookkeepingDefaultsExecutor(tx), {
    organizationId,
    actorUserId,
  });
  await copyMenuTemplate(organizationId, createMenuTemplateExecutor(tx));
}

@Injectable()
export class OrganizationInitializer {
  initialize = initializeOrganization;
}
