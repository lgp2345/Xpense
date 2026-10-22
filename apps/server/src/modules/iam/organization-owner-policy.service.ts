import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthContext } from "../../common/auth/auth-context.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { OrganizationOwnerRepository } from "./organization-owner.repository.js";

export type LockedMember = { userId: string; roleId: string; status: "active" | "disabled" };
export type MemberMutation = { userId?: string; roleId?: string; status?: "active" | "disabled" };

@Injectable()
export class OrganizationOwnerPolicyService {
  constructor(private readonly repository: OrganizationOwnerRepository) {}

  async lockOrganization(organizationId: string, tx: AppDbExecutor): Promise<void> {
    if (!(await this.repository.lockOrganization(organizationId, tx)))
      throw new ForbiddenException("组织无效或已停用");
  }

  /** 调用方先持有组织行锁；身份、有效负责人数量及写入使用同一事务。 */
  async assertMemberMutation(
    ctx: AuthContext,
    target: LockedMember | null,
    next: MemberMutation,
    tx: AppDbExecutor,
  ): Promise<void> {
    const actor = await this.repository.findActiveUser(ctx.userId, tx);
    if (!actor) throw new ForbiddenException("操作账号无效或已停用");
    const actorRole = await this.repository.findActiveMemberRole(
      ctx.organizationId,
      ctx.userId,
      tx,
    );
    if (!actor.isSuperAdmin && !actorRole) throw new ForbiddenException("当前组织成员资格已失效");
    const oldKey = target
      ? await this.repository.findRoleKey(ctx.organizationId, target.roleId, tx)
      : null;
    const newKey = next.roleId
      ? await this.repository.findRoleKey(ctx.organizationId, next.roleId, tx)
      : oldKey;
    if (next.roleId && !newKey) throw new NotFoundException("角色不存在");
    if (oldKey !== "owner" && newKey !== "owner") return;
    if (!actor.isSuperAdmin && actorRole !== "owner")
      throw new ForbiddenException("仅组织负责人或平台超级管理员可管理负责人");
    const userId = target?.userId ?? next.userId;
    const user = userId ? await this.repository.findActiveUser(userId, tx) : null;
    const wasEffective = Boolean(user && target?.status === "active" && oldKey === "owner");
    const willBeEffective =
      newKey === "owner" && (next.status ?? target?.status ?? "active") === "active";
    if (willBeEffective && !user) throw new ForbiddenException("停用账号不能设为有效负责人");
    if (
      wasEffective &&
      !willBeEffective &&
      (await this.repository.countActiveOwners(ctx.organizationId, tx)) <= 1
    )
      throw new ConflictException("组织必须保留至少一位有效负责人");
  }
}
