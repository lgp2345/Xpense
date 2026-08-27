import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import type { LedgerRecord } from "./bookkeeping.types.js";
import { LedgersRepository } from "./ledgers.repository.js";

type CreateRentalLedgerInput = {
  organizationId: string;
  name: string;
  actorUserId: string;
};

type RenameRentalLedgerInput = {
  organizationId: string;
  id: string;
  name: string;
};

type DeleteRentalLedgerInput = {
  organizationId: string;
  id: string;
  actorUserId: string;
};

/** 为租赁房产业务提供账本创建、重命名和删除的受限事务边界。 */
@Injectable()
export class RentalLedgerBoundaryService {
  constructor(private readonly repository: LedgersRepository) {}

  /** 在调用方的房产创建事务中生成非默认租赁账本。 */
  create(input: CreateRentalLedgerInput, executor: AppDbExecutor): Promise<LedgerRecord> {
    return this.repository.createRental(
      {
        organizationId: input.organizationId,
        name: input.name,
        createdByUserId: input.actorUserId,
      },
      executor,
    );
  }

  /** 在调用方事务中重命名同组织的有效租赁账本。 */
  async rename(input: RenameRentalLedgerInput, executor: AppDbExecutor): Promise<void> {
    if (!(await this.repository.renameActiveRental(input, executor))) {
      throw this.notFound("租赁账本不存在");
    }
  }

  /** 当租赁账本存在任意历史交易引用时，拒绝删除以保留完整账务历史。 */
  async assertDeletable(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    const ledger = await this.repository.findActiveRental(organizationId, id, executor);
    if (!ledger) throw this.notFound("租赁账本不存在");
    if (await this.repository.hasAnyTransactionReference(organizationId, id, executor)) {
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "租赁账本已有历史交易，不能删除",
      });
    }
  }

  /** 在调用方事务中软删除同组织的有效租赁账本，并保留操作者信息。 */
  async softDelete(input: DeleteRentalLedgerInput, executor: AppDbExecutor): Promise<void> {
    const deleted = await this.repository.softDeleteActiveRental(
      {
        organizationId: input.organizationId,
        id: input.id,
        deletedByUserId: input.actorUserId,
      },
      executor,
    );
    if (!deleted) throw this.notFound("租赁账本不存在");
  }

  /** 创建不泄露跨组织、已删除或非租赁账本存在性的未找到异常。 */
  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }
}
