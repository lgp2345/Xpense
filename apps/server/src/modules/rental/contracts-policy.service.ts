import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizations } from "../../db/schema.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import { assertContractAggregate, type ContractAggregateValue } from "./contract.rules.js";
import { findSpaceConflicts } from "./contract-conflicts.queries.js";
import { compareCalendarDates, organizationDate } from "./contract-date.rules.js";
import type {
  ContractPartyReference,
  ContractSpaceReference,
  RentalContractRecord,
  RentalContractSpaceConflictRecord,
} from "./contracts.repository.types.js";
import { PropertiesRepository } from "./properties.repository.js";
import type { RentalPropertyRecord } from "./properties.repository.types.js";
import { SpacesRepository } from "./spaces.repository.js";
import type { RentalSpaceRecord } from "./spaces.repository.types.js";
import { TenantsRepository } from "./tenants.repository.js";
import type { RentalTenantRecord } from "./tenants.repository.types.js";

type ValidatedSpace = RentalSpaceRecord & { path: Array<{ id: string; name: string }> };
type ConfirmationScopeInput = ContractAggregateValue & {
  organizationId: string;
  contractId: string;
  property: RentalPropertyRecord;
  parties: ContractPartyReference[];
  spaces: ContractSpaceReference[];
};

/** 集中执行合同组织日期、锁顺序、关联有效性、聚合及空间冲突规则。 */
@Injectable()
export class ContractsPolicyService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly writeLockRepository: BookkeepingWriteLockRepository,
    private readonly propertiesRepository: PropertiesRepository,
    private readonly spacesRepository: SpacesRepository,
    private readonly tenantsRepository: TenantsRepository,
  ) {}

  /** 锁定组织并返回其 IANA 时区和本地今天。 */
  async lockOrganizationContext(
    organizationId: string,
    executor: AppDbExecutor,
  ): Promise<{ timezone: string; today: string }> {
    if (!(await this.writeLockRepository.lockOrganization(organizationId, executor))) {
      throw this.notFound("组织不存在");
    }
    return this.readOrganizationContext(organizationId, executor);
  }

  /** 返回组织本地今天，供合同列表和详情派生展示状态。 */
  async organizationToday(organizationId: string): Promise<string> {
    return (await this.readOrganizationContext(organizationId, this.db)).today;
  }

  /** 在组织锁之后锁定组织自有房产，供历史合同与生命周期操作使用。 */
  async requireOwnedPropertyForUpdate(
    organizationId: string,
    propertyId: string,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const property = await this.propertiesRepository.findActiveOwnedForUpdate(
      organizationId,
      propertyId,
      executor,
    );
    if (!property) throw this.notFound("租赁房产不存在");
    return property;
  }

  /** 锁定组织自有房产，并要求其仍可用于合同核心资料。 */
  async requireActivePropertyForUpdate(
    organizationId: string,
    propertyId: string,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const property = await this.requireOwnedPropertyForUpdate(organizationId, propertyId, executor);
    this.assertPropertyActive(property);
    return property;
  }

  /** 要求已锁定房产仍启用。 */
  assertPropertyActive(property: RentalPropertyRecord): void {
    if (!property.isActive) throw this.conflict("租赁房产已停用");
  }

  /** 将组织范围合同空结果统一转换为不泄露存在性的 404。 */
  requireContract<T>(contract: T | null): T {
    if (!contract) throw this.notFound("租赁合同不存在");
    return contract;
  }

  /** 断言合同处于指定持久化生命周期。 */
  // biome-ignore format: 简短状态守卫保持业务文件体量清晰。
  assertLifecycle(contract: RentalContractRecord, expected: RentalContractRecord["status"]): void { if (contract.status !== expected) throw this.conflict("租赁合同状态不允许执行该操作"); }

  /** 验证草稿完整快照中已选择的关联均可继续使用。 */
  async validateDraftRelations(
    input: Omit<ConfirmationScopeInput, "contractId">,
    executor: AppDbExecutor,
  ): Promise<void> {
    this.assertAggregate(input);
    await this.lockAndValidateSpaces(input, executor);
    await this.lockAndValidateTenants(input.organizationId, input.parties, executor);
  }

  /** 校验续租源合同的空间与历史承租方引用，不读取当前租户主档。 */
  async validateRenewalRelations(
    input: Omit<ConfirmationScopeInput, "contractId">,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (
      input.parties.length === 0 ||
      new Set(input.parties.map(({ tenantId }) => tenantId)).size !== input.parties.length ||
      input.parties.filter(({ isPrimaryPayer }) => isPrimaryPayer).length !== 1
    ) {
      throw this.conflict("续租源合同缺少有效的末期承租方历史");
    }
    this.assertAggregate(input);
    await this.lockAndValidateSpaces(input, executor);
  }

  /** 执行确认级聚合、空间树、租户与闭区间冲突校验并返回快照来源。 */
  async validateConfirmationScope(
    input: ConfirmationScopeInput,
    executor: AppDbExecutor,
  ): Promise<{
    property: RentalPropertyRecord;
    tenants: RentalTenantRecord[];
    spaces: ValidatedSpace[];
  }> {
    this.assertAggregate(input);
    const spaces = await this.lockAndValidateSpaces(input, executor);
    const tenants = await this.lockAndValidateTenants(
      input.organizationId,
      input.parties,
      executor,
    );
    const conflicts = await findSpaceConflicts(
      {
        organizationId: input.organizationId,
        propertyId: input.property.id,
        spaceIds: input.spaces.map(({ spaceId }) => spaceId),
        startDate: input.startDate as string,
        endDate: input.endDate as string,
        excludeContractId: input.contractId,
      },
      executor,
    );
    if (conflicts.length > 0) throw this.conflict("合同租期与现有空间合同冲突");
    return { property: input.property, tenants, spaces };
  }

  /** 锁定并校验可用性请求空间，返回安全冲突摘要及空间名称。 */
  async checkSpaceAvailability(
    input: {
      organizationId: string;
      property: RentalPropertyRecord;
      spaceIds: string[];
      startDate: string;
      endDate: string;
      excludeContractId?: string;
    },
    executor: AppDbExecutor,
  ): Promise<Array<RentalContractSpaceConflictRecord & { spaceName: string }>> {
    const spaces = await this.lockAndValidateSpaces(
      {
        organizationId: input.organizationId,
        property: input.property,
        spaces: input.spaceIds.map((spaceId) => ({ spaceId })),
      },
      executor,
    );
    const conflicts = await findSpaceConflicts(
      {
        organizationId: input.organizationId,
        propertyId: input.property.id,
        spaceIds: input.spaceIds,
        startDate: input.startDate,
        endDate: input.endDate,
        excludeContractId: input.excludeContractId,
      },
      executor,
    );
    const names = new Map(spaces.map((space) => [space.id, space.name]));
    for (const conflict of conflicts) {
      if (names.has(conflict.spaceId)) continue;
      const space = await this.spacesRepository.findActiveOwned(
        input.organizationId,
        input.property.id,
        conflict.spaceId,
        executor,
      );
      if (space) names.set(space.id, space.name);
    }
    return conflicts.map((conflict) => ({
      ...conflict,
      spaceName: names.get(conflict.spaceId) ?? "租赁空间",
    }));
  }

  /** 判断确认合同更新属于开始前核心修正还是开始后的元数据修正。 */
  assertPreStartCorrection(
    contract: RentalContractRecord,
    today: string,
    changes: object,
  ): "pre_start" | "metadata_only" {
    this.assertLifecycle(contract, "confirmed");
    if (!contract.startDate) throw this.conflict("已确认合同缺少开始日期");
    if (compareCalendarDates(today, contract.startDate) < 0) return "pre_start";
    const metadataFields = new Set(["id", "externalContractNumber", "note"]);
    if (Object.keys(changes).some((field) => !metadataFields.has(field))) {
      throw this.conflict("合同开始后不能修正核心合同资料");
    }
    return "metadata_only";
  }

  /** 只允许组织本地开始日前取消已确认合同。 */
  // biome-ignore format: 紧凑表达单一状态与日期守卫。
  assertCancellationAllowed(contract: RentalContractRecord, today: string): void { this.assertLifecycle(contract, "confirmed"); if (!contract.startDate || compareCalendarDates(today, contract.startDate) >= 0) throw this.conflict("租赁合同开始后不能取消"); }

  /** 创建供服务层复用的状态冲突异常。 */
  // biome-ignore format: 简短异常工厂无需拆成多行。
  conflict(message: string): ConflictException { return new ConflictException({ code: apiErrorCodes.conflict, message }); }

  private async readOrganizationContext(organizationId: string, executor: AppDbExecutor) {
    const [context] = await executor
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!context) throw this.notFound("组织不存在");
    try {
      return { timezone: context.timezone, today: organizationDate(new Date(), context.timezone) };
    } catch (error) {
      throw this.badRequest(error instanceof Error ? error.message : "组织时区无效");
    }
  }

  private assertAggregate(input: ContractAggregateValue): void {
    try {
      assertContractAggregate(input);
    } catch (error) {
      throw this.badRequest(error instanceof Error ? error.message : "租赁合同资料无效");
    }
  }

  private async lockAndValidateTenants(
    organizationId: string,
    parties: ContractPartyReference[],
    executor: AppDbExecutor,
  ): Promise<RentalTenantRecord[]> {
    const tenants: RentalTenantRecord[] = [];
    for (const tenantId of parties.map(({ tenantId }) => tenantId).toSorted()) {
      const tenant = await this.tenantsRepository.findActiveOwnedForUpdate(
        organizationId,
        tenantId,
        executor,
      );
      if (!tenant) throw this.notFound("租赁租户不存在");
      if (!tenant.isActive) throw this.conflict("租赁租户已停用");
      tenants.push(tenant);
    }
    return tenants;
  }

  private async lockAndValidateSpaces(
    input: {
      organizationId: string;
      property: RentalPropertyRecord;
      spaces: ContractSpaceReference[];
    },
    executor: AppDbExecutor,
  ): Promise<ValidatedSpace[]> {
    if (!input.property.isActive) throw this.conflict("租赁房产已停用");
    const spaces: ValidatedSpace[] = [];
    for (const spaceId of input.spaces.map(({ spaceId }) => spaceId).toSorted()) {
      const space = await this.spacesRepository.findActiveOwnedForUpdate(
        input.organizationId,
        input.property.id,
        spaceId,
        executor,
      );
      if (!space) throw this.notFound("租赁空间不存在");
      if (!space.isActive || !space.isRentable) throw this.conflict("租赁空间不可出租");
      const path = await this.spacesRepository.listAncestors(
        input.organizationId,
        input.property.id,
        space.id,
        executor,
      );
      if (path.length === 0 || path.at(-1)?.id !== space.id) throw this.notFound("租赁空间不存在");
      for (const ancestor of path.slice(0, -1)) {
        const record = await this.spacesRepository.findActiveOwned(
          input.organizationId,
          input.property.id,
          ancestor.id,
          executor,
        );
        if (!record) throw this.notFound("租赁空间不存在");
        if (!record.isActive) throw this.conflict("租赁空间祖先已停用");
      }
      spaces.push({ ...space, path });
    }
    const selectedIds = new Set(spaces.map(({ id }) => id));
    if (
      spaces.some(({ id, path }) => path.some((node) => node.id !== id && selectedIds.has(node.id)))
    ) {
      throw this.conflict("同一合同空间不能互为祖先或后代");
    }
    return spaces;
  }

  // biome-ignore format: 简短异常工厂无需拆成多行。
  private badRequest(message: string): BadRequestException { return new BadRequestException({ code: apiErrorCodes.validationFailed, message }); }

  // biome-ignore format: 简短异常工厂无需拆成多行。
  private notFound(message: string): NotFoundException { return new NotFoundException({ code: apiErrorCodes.notFound, message }); }
}
