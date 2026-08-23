import { ConflictException, Injectable } from "@nestjs/common";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AccountsRepository } from "./accounts.repository.js";

type CreateOpeningBalanceInput = {
  organizationId: string;
  accountId: string;
  actorUserId: string;
  amountMinor: number;
};

/** 将账户初始余额转换为不计收支的交易与账户流水。 */
@Injectable()
export class OpeningBalanceService {
  constructor(private readonly repository: AccountsRepository) {}

  /**
   * 在账户创建事务内写入一笔排除型期初余额。
   * @param input 组织、账户、操作者与有符号最小货币单位金额。
   * @param executor 必须与账户创建共用的事务执行器。
   * @throws ConflictException 当前组织缺少有效默认个人账本时抛出。
   */
  async create(input: CreateOpeningBalanceInput, executor: AppDbExecutor): Promise<string> {
    const ledgerContext = await this.repository.findDefaultLedgerContext(
      input.organizationId,
      executor,
    );

    if (!ledgerContext) {
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "当前组织缺少有效的默认个人账本",
      });
    }

    const occurredAt = new Date();
    const occurredOn = this.toOrganizationDate(occurredAt, ledgerContext.timezone);

    return this.repository.writeOpeningBalance(
      {
        organizationId: input.organizationId,
        ledgerId: ledgerContext.ledgerId,
        accountId: input.accountId,
        actorUserId: input.actorUserId,
        type: input.amountMinor > 0 ? "excluded_inflow" : "excluded_outflow",
        amountMinor: Math.abs(input.amountMinor),
        movementAmountMinor: input.amountMinor,
        occurredAt,
        occurredOn,
      },
      executor,
    );
  }

  /**
   * 按组织 IANA 时区将发生时刻转换为 YYYY-MM-DD 账务日期。
   * @param instant 真实发生时刻。
   * @param timezone 组织 IANA 时区。
   */
  private toOrganizationDate(instant: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
  }
}
