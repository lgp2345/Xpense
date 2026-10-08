import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("样例正式入口的实际loader提供完整Nest构造器注入元数据", async () => {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const invocation = pkg.scripts["db:seed-rental-period-billing"]
    .split(" -- node ")[1]
    .split(" ") as string[];
  const entry = invocation.pop()!;
  const root = entry.startsWith("dist/") ? "dist" : "src";
  const code = `import 'reflect-metadata'; import { PeriodBillsService } from './${root}/modules/rental/period-bills.service.js'; const params=Reflect.getMetadata('design:paramtypes',PeriodBillsService); process.stdout.write(JSON.stringify({count:params?.length ?? 0}));`;
  const result = spawnSync(process.execPath, [...invocation, "--input-type=module", "-e", code], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).count).toBe(10);
});
