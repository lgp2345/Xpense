import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type ServerPackageManifest = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type SharedPackageManifest = {
  exports?: Record<string, unknown>;
};

describe("server development runtime", () => {
  it("uses the NestJS 12 CLI watch pipeline that emits dependency metadata", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as ServerPackageManifest;

    expect(manifest.scripts?.dev).toBe("dotenv -e ../../.env -- nest start --watch --exec tsx");
    expect(manifest.devDependencies?.["@nestjs/cli"]).toBe("12.0.0");
  });

  it("resolves the shared workspace package to compiled ESM in production", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../../../packages/shared/package.json", import.meta.url), "utf8"),
    ) as SharedPackageManifest;

    expect(manifest.exports?.["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
  });
});
