import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertRentalCleanupObjects, readRentalCleanupObjects } from "./rental-postgres-cleanup.js";
import {
  assertRentalTestSchema,
  copyRentalMigrationCorpus,
  rentalTestDatabaseUrl,
} from "./rental-postgres-corpus.js";

/** 仅供经显式批准的一次性库演练；所有业务连接都指向本次独立 schema。 */
export async function withRentalPostgres<T>(
  url: string,
  run: (fixture: RentalPostgresHarness) => Promise<T>,
): Promise<T> {
  rentalTestDatabaseUrl({
    RENTAL_MIGRATION_TEST_DATABASE_URL: url,
    RENTAL_FINANCE_TEST_DDL_APPROVED: "isolated-schema",
  });
  const schema = `rental_finance_test_${randomUUID().replaceAll("-", "")}`;
  assertRentalTestSchema(schema);
  const marker = `rental-finance-test:${randomUUID()}`;
  const admin = postgres(url, {
    max: 1,
    onnotice: () => {},
    connection: { application_name: "xpense-rental-test-control", statement_timeout: 30000 },
  });
  const workers: ReturnType<typeof postgres>[] = [];
  let created = false;
  let ownership: { oid: number; owner: number } | null = null;
  let result: T | undefined;
  const errors: unknown[] = [];
  try {
    await admin`CREATE SCHEMA ${admin(schema)}`;
    created = true;
    // 名称和标记全部由 helper 生成；COMMENT 不接受绑定参数。
    await admin.unsafe(`COMMENT ON SCHEMA "${schema}" IS '${marker}'`);
    const [row] = await admin<
      { oid: number; owner: number }[]
    >`SELECT oid::integer AS oid, nspowner::integer AS owner FROM pg_namespace WHERE nspname = ${schema}`;
    if (!row) throw new Error("新建测试 schema 不可读取");
    ownership = row;
    const connect = async () => {
      const client = postgres(url, {
        max: 1,
        onnotice: () => {},
        connection: {
          search_path: schema,
          application_name: "xpense-rental-finance-test",
          statement_timeout: 30000,
          lock_timeout: 15000,
          idle_in_transaction_session_timeout: 30000,
        },
      });
      workers.push(client);
      const [session] = await client<
        { path: string; pid: number }[]
      >`SELECT current_setting('search_path') AS path, pg_backend_pid() AS pid`;
      if (session?.path !== schema) throw new Error("测试连接未隔离到本次 schema");
      return { client, db: drizzle({ client }), pid: session.pid };
    };
    const primary = await connect();
    const applyMigrations = async (legacyOnly = false) => {
      const corpus = await copyRentalMigrationCorpus(schema, legacyOnly);
      await migrate(primary.db, { migrationsFolder: corpus.folder, migrationsSchema: schema });
      return corpus;
    };
    result = await run({ schema, schemaOid: ownership.oid, ...primary, connect, applyMigrations });
  } catch (error) {
    errors.push(error);
  }
  // 先结束所有业务连接和待处理事务，再检查并清理本次 schema。
  for (const worker of workers) {
    try {
      await worker.end({ timeout: 5 });
    } catch (error) {
      errors.push(error);
    }
  }
  if (ownership) {
    try {
      const [current] = await admin<{ oid: number; owner: number; marker: string | null }[]>`
        SELECT oid::integer AS oid, nspowner::integer AS owner, obj_description(oid, 'pg_namespace') AS marker
        FROM pg_namespace WHERE nspname = ${schema}`;
      if (
        !current ||
        current.oid !== ownership.oid ||
        current.owner !== ownership.owner ||
        current.marker !== marker
      ) {
        throw new Error("拒绝清理：schema 所有权证据改变");
      }
      assertRentalCleanupObjects(schema, await readRentalCleanupObjects(admin, ownership.oid));
      await admin`DROP SCHEMA ${admin(schema)} CASCADE`;
    } catch (error) {
      errors.push(error);
    }
  } else if (created)
    errors.push(new Error(`已创建测试 schema ${schema}，归属证据未完成，保留对象等待受控处理`));
  try {
    await admin.end({ timeout: 5 });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw new AggregateError(errors, "租赁 PostgreSQL 演练或隔离清理失败");
  return result as T;
}

export type RentalPostgresHarness = {
  schema: string;
  schemaOid: number;
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle>;
  pid: number;
  connect: () => Promise<{
    client: ReturnType<typeof postgres>;
    db: ReturnType<typeof drizzle>;
    pid: number;
  }>;
  applyMigrations: (
    legacyOnly?: boolean,
  ) => Promise<Awaited<ReturnType<typeof copyRentalMigrationCorpus>>>;
};
