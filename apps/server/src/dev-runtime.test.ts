import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type ServerPackageManifest = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("server development runtime", () => {
  it("uses the NestJS 12 CLI watch pipeline that emits dependency metadata", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as ServerPackageManifest;

    expect(manifest.scripts?.dev).toBe("dotenv -e ../../.env -- nest start --watch --exec tsx");
    expect(manifest.devDependencies?.["@nestjs/cli"]).toBe("12.0.0");
  });
});
