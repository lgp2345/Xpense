import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const firstMigration = "20260704154322_pink_sauron";
const firstHash = "ddb4761829e97154667c6f07f4a0e2183b0194e33545a73d86949ae8234d41c0";
const reviewedHashes: Record<string, string> = {
  "20261002133352_rental_charge_collection":
    "1a2a2cb8dcde660a60c2876f1eae7a1e075592c64627f1c8f433064f1e040fb2",
  "20260704154322_pink_sauron": "ddb4761829e97154667c6f07f4a0e2183b0194e33545a73d86949ae8234d41c0",
  "20260808230632_moaning_ken_ellis":
    "538a7c537df23fad60eb80df94e7930e4dd2de364d7143cb8cb45a802fc56b3a",
  "20260810230000_organization_menus":
    "7e39808416f0f2dc380cdf5a70787798a930db80143c8e53ec1931f78171f765",
  "20260816153926_marvelous_butterfly":
    "ac96b862799f01d7badab7170d97ee813be8554c98a1f3c1c916f6dae5cd6cc9",
  "20260823120651_old_hellcat": "3f8b06eeca8ab5162b2154098272a9ec092580e6ad7bf2617803fac7cadd77f3",
  "20260825234401_rental_properties_spaces":
    "d4c7957f9fbecb3ee774da6e92e02d8df6af748698c7cb95a07e3c6fda011269",
  "20260829233247_rental_tenants_contracts":
    "376fa56d70cb0f871a76d1bea60b401a8c1deab8fb26ae23bbd4f25989edb099",
  "20260831010030_opposite_chamber":
    "5ef9363df93cf8fa3ce6538c1eb41d40f4a8765cb656e20e55ada76c493c9505",
  "20260902160457_spooky_infant_terrible":
    "51ae1b22c3a88460bddfd8a8d7de1cfbe2479b1594684b020c5ed0c3fb27ebdf",
  "20260927161043_rental_billing":
    "59d412b2ad55d39a4406cad250a02db17cb798609a1e3411e8a84461bee5ac4a",
  "20260928035119_rental_billing_scope":
    "f8421cb988dd0c4d37985e71e5cb79cb3555013585e72c0465d9f62af6b3bab4",
  "20260928154635_rental_monthly_enums":
    "d04e76d3208e8a6bc5efe69ebc8985ccbb6a94f3a0c4284c94ab754f66fdf1d4",
  "20260929014516_rental_monthly_finance":
    "0bdfa436cfd78be643be31e2286854f88ccd1e681481bcb19da37660d296c3a5",
  "20261001131738_rental_monthly_permissions":
    "030399877c3f3f1b2ccac1fc52d22a2f891e9eda58a383e433fa60ccd28021b6",
};

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** 测试 helper 只接受本次随机生成的独立命名空间。 */
export function assertRentalTestSchema(name: string): void {
  if (!/^rental_finance_test_[a-f0-9]{32}$/.test(name)) throw new Error("非法租赁测试 schema");
}

/** 连接配置与 DDL 许可分开；拒绝 URL 覆盖客户端的隔离启动参数。 */
export function rentalTestDatabaseUrl(env: NodeJS.ProcessEnv): string | null {
  const value = env.RENTAL_MIGRATION_TEST_DATABASE_URL;
  if (!value || env.RENTAL_FINANCE_TEST_DDL_APPROVED !== "isolated-schema") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("测试库连接格式无效");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("测试库协议无效");
  const protectedParameters = [
    "search_path",
    "options",
    "application_name",
    "statement_timeout",
    "lock_timeout",
    "idle_in_transaction_session_timeout",
  ];
  if (
    [...parsed.searchParams.keys()].some((key) => protectedParameters.includes(key.toLowerCase()))
  ) {
    throw new Error("拒绝测试连接参数覆盖");
  }
  return value;
}

/** 只在临时副本移入已核对的17处命名空间；原文件、排序、断点及 runner 不变。 */
export async function copyRentalMigrationCorpus(
  schema: string,
  legacyOnly: boolean | string = false,
) {
  assertRentalTestSchema(schema);
  const root = fileURLToPath(new URL("../db/migrations/", import.meta.url));
  const names = (await readdir(root)).filter((name) => /^\d{14}_/.test(name)).sort();
  if (
    names.length !== 15 ||
    names[0] !== firstMigration ||
    names.at(-1) !== "20261002133352_rental_charge_collection"
  ) {
    throw new Error("迁移目录已变化，须重新核对演练范围");
  }
  const folder = await mkdtemp(join(tmpdir(), "xpense-rental-migrations-"));
  const entries = [];
  for (const name of names) {
    if (typeof legacyOnly === "string" && name > legacyOnly) continue;
    if (legacyOnly === true && name > "20260928035119_rental_billing_scope") continue;
    const originalPath = join(root, name, "migration.sql");
    const original = await readFile(originalPath, "utf8");
    if (reviewedHashes[name] !== sha(original)) throw new Error("迁移内容偏离已评审演练语料");
    let copied = original;
    if (name === firstMigration) {
      if (sha(original) !== firstHash || original.split('"public".').length !== 18) {
        throw new Error("首段迁移不匹配已评审 SHA 与17处限定名");
      }
      copied = original.replaceAll('"public".', `"${schema}".`);
      if (copied.replaceAll(`"${schema}".`, '"public".') !== original)
        throw new Error("命名空间改写不可逆");
    } else if (/\bpublic\s*\.|"public"\s*\./i.test(original)) {
      throw new Error("后续迁移出现未评审共享命名空间");
    }
    await mkdir(join(folder, name));
    await writeFile(join(folder, name, "migration.sql"), copied);
    entries.push({ name, originalPath, originalHash: sha(original), copiedHash: sha(copied) });
  }
  return { folder, entries };
}
