import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { users } from "../../db/schema.js";

@Injectable()
export class MemberAccountsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findByPhone(phone: string, tx: AppDbExecutor = this.db) {
    const [user] = await tx
      .select({ id: users.id, username: users.username, status: users.status })
      .from(users)
      .where(eq(users.phone, phone))
      .for("no key update")
      .limit(1);
    return user ?? null;
  }

  async create(
    input: { phone: string; username: string; passwordHash: string },
    tx: AppDbExecutor,
  ): Promise<string> {
    const [user] = await tx
      .insert(users)
      .values({ ...input, initialPasswordUnchanged: true })
      .onConflictDoNothing({ target: users.phone })
      .returning({ id: users.id });
    if (!user) throw new ConflictException("手机号注册状态已变化，请重新查询后重试");
    return user.id;
  }
}
