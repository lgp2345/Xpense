import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type { AppDb } from "./db.module.js";
import { DB } from "./db.tokens.js";

@Injectable()
export class DatabaseReadinessService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async check(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
