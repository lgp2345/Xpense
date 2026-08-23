import { Injectable } from "@nestjs/common";
import type { LedgerSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { LedgersRepository } from "./ledgers.repository.js";

/** 提供当前组织的账本查询。 */
@Injectable()
export class LedgersService {
  constructor(private readonly repository: LedgersRepository) {}

  /**
   * 列出当前认证组织的有效账本。
   * @param authContext 可信认证上下文。
   * @returns 可供客户端展示的账本摘要。
   */
  async list(authContext: AuthContext): Promise<LedgerSummary[]> {
    const rows = await this.repository.listActive(authContext.organizationId);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
