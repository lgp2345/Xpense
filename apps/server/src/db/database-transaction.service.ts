import { Inject, Injectable } from "@nestjs/common";

import type { AppDb, AppDbTransaction } from "./db.module.js";
import { DB } from "./db.tokens.js";

@Injectable()
export class DatabaseTransactionService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(operation);
  }
}
