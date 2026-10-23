import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AppDbExecutor } from "../../db/db.module.js";
import { PasswordService } from "../auth/password.service.js";
import { MemberAccountsRepository } from "./member-accounts.repository.js";

@Injectable()
export class MemberAccountsService {
  constructor(
    private readonly repository: MemberAccountsRepository,
    private readonly passwords: PasswordService,
  ) {}

  async findCandidate(phone: string) {
    const user = await this.repository.findByPhone(phone);
    return user ? { username: user.username, status: user.status } : null;
  }

  /** 已注册手机号仅关联原账号，不允许组织成员管理修改其全局资料。 */
  async resolve(phone: string, username: string, tx: AppDbExecutor): Promise<string> {
    const existing = await this.repository.findByPhone(phone, tx);
    if (existing) {
      if (existing.status !== "active") throw new ForbiddenException("已停用账号不能添加为成员");
      return existing.id;
    }
    return this.repository.create(
      { phone, username, passwordHash: await this.passwords.hash("888888") },
      tx,
    );
  }
}
