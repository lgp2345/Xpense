import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { RentalLeaseBlockedReason, RentalLeaseStatus } from "@xpense/shared";
import { eq } from "drizzle-orm";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizations } from "../../db/schema.js";
import { organizationDate } from "./contract-date.rules.js";
import { ContractsRepository } from "./contracts.repository.js";
import type {
  ContractReferenceQueryInput,
  ContractReferenceSummary,
  PropertyContractCounts,
} from "./contracts.repository.types.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";
import { toSpaceLeaseState } from "./space-lease-status.queries.js";
import { SpacesRepository } from "./spaces.repository.js";
import type { SpaceLeaseStateFacts } from "./spaces.repository.types.js";
import { SpacesPolicyService } from "./spaces-policy.service.js";

/** 组织锁之后读取合同引用事实，并以安全摘要保护房产/空间生命周期写入。 */
@Injectable()
export class ContractReferenceService {
  constructor(
    private readonly contractsRepository: ContractsRepository,
    private readonly spacesRepository: SpacesRepository,
    @Inject(DB) private readonly db: AppDb,
    private readonly propertiesPolicy: PropertiesPolicyService,
    private readonly spacesPolicy: SpacesPolicyService,
  ) {}

  /** 在指定事务执行器上读取组织本地今天。 */
  async organizationToday(
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<string> {
    if (typeof executor.select !== "function")
      throw new Error("Contract reference requires a database select executor");
    const [organization] = await executor
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!organization)
      throw new NotFoundException({ code: apiErrorCodes.notFound, message: "组织不存在" });
    return organizationDate(new Date(), organization.timezone);
  }

  /** 断言房产没有当前或未来已确认合同引用。 */
  async assertPropertyCanDeactivate(
    organizationId: string,
    propertyId: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    const today = await this.organizationToday(organizationId, executor);
    const summary = await this.contractsRepository.findContractReferenceSummary(
      { organizationId, propertyId, today },
      executor,
    );
    if (summary.own) {
      this.propertiesPolicy.assertCanDeactivate(summary);
    }
  }

  /** 断言空间自身、祖先和后代没有当前或未来合同引用。 */
  async assertSpaceCanDeactivate(
    organizationId: string,
    propertyId: string,
    spaceId: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    const today = await this.organizationToday(organizationId, executor);
    const ancestors = await this.spacesRepository.listAncestors(
      organizationId,
      propertyId,
      spaceId,
      executor,
    );
    const descendants = await this.spacesRepository.listDescendantIds(
      organizationId,
      propertyId,
      spaceId,
      executor,
    );
    const summary = await this.contractsRepository.findContractReferenceSummary(
      {
        organizationId,
        propertyId,
        today,
        ownSpaceIds: [spaceId],
        descendantSpaceIds: descendants,
        oldAncestorSpaceIds: ancestors.filter(({ id }) => id !== spaceId).map(({ id }) => id),
      },
      executor,
    );
    if (summary.own || summary.descendant || summary.oldAncestor) {
      this.spacesPolicy.assertCanDeactivate(summary);
    }
  }

  /** 断言移动影响集合：目标、全部后代、旧路径祖先、新路径祖先。 */
  async assertSpaceCanMove(
    organizationId: string,
    propertyId: string,
    spaceId: string,
    oldParentId: string | null,
    newParentId: string | null,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (oldParentId === newParentId) return;
    const today = await this.organizationToday(organizationId, executor);
    const oldPath = await this.spacesRepository.listAncestors(
      organizationId,
      propertyId,
      spaceId,
      executor,
    );
    const newPath = newParentId
      ? await this.spacesRepository.listAncestors(organizationId, propertyId, newParentId, executor)
      : [];
    const descendants = await this.spacesRepository.listDescendantIds(
      organizationId,
      propertyId,
      spaceId,
      executor,
    );
    const oldAncestors = oldPath.filter(({ id }) => id !== spaceId).map(({ id }) => id);
    const newAncestors = newPath.filter(({ id }) => id !== spaceId).map(({ id }) => id);
    const summary = await this.contractsRepository.findContractReferenceSummary(
      {
        organizationId,
        propertyId,
        today,
        ownSpaceIds: [spaceId],
        descendantSpaceIds: descendants,
        oldAncestorSpaceIds: oldAncestors,
        newAncestorSpaceIds: newAncestors,
      },
      executor,
    );
    if (summary.own || summary.descendant || summary.oldAncestor || summary.newAncestor) {
      this.spacesPolicy.assertCanMove(summary);
    }
  }

  /** 查询房产当前/未来合同三桶互斥计数。 */
  countPropertyContracts(
    organizationId: string,
    propertyId: string,
    today: string,
    executor: AppDbExecutor = this.db,
  ): Promise<PropertyContractCounts> {
    return this.contractsRepository.countPropertyContracts(
      organizationId,
      propertyId,
      today,
      executor,
    );
  }

  /** 查询当前页空间的合同事实，始终单批执行。 */
  listSpaceLeaseStates(
    organizationId: string,
    propertyId: string,
    spaceIds: string[],
    today: string,
    executor: AppDbExecutor = this.db,
  ): Promise<Map<string, SpaceLeaseStateFacts>> {
    if (spaceIds.length === 0) return Promise.resolve(new Map());
    if (typeof this.spacesRepository.listLeaseStates !== "function")
      throw new Error("Contract reference requires a lease state repository");
    return this.spacesRepository.listLeaseStates(
      organizationId,
      propertyId,
      [...new Set(spaceIds)],
      today,
      executor,
    );
  }

  /** 派生自身状态优先级：expiring_soon > active > upcoming > vacant。 */
  static toLeaseState(
    facts: Pick<
      SpaceLeaseStateFacts,
      | "hasOwnActive"
      | "hasOwnExpiringSoon"
      | "hasOwnUpcoming"
      | "hasAncestorCurrentOrUpcoming"
      | "hasDescendantCurrentOrUpcoming"
    >,
  ): {
    leaseStatus: RentalLeaseStatus;
    leaseBlockedReason: RentalLeaseBlockedReason | null;
    hasUpcomingContract: boolean;
  } {
    return toSpaceLeaseState(facts);
  }
}

export type { ContractReferenceQueryInput, ContractReferenceSummary };
