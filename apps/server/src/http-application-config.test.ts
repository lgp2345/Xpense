import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HTTP application configuration boundary", () => {
  it("makes production and E2E bootstrap use the same HTTP configuration entry point", async () => {
    const [mainSource, testAppSource] = await Promise.all([
      readFile(new URL("./main.ts", import.meta.url), "utf8"),
      readFile(new URL("./test/create-test-app.ts", import.meta.url), "utf8"),
    ]);

    for (const source of [mainSource, testAppSource]) {
      expect(source).toContain("configureHttpApplication(app)");
      expect(source).not.toContain('from "@fastify/cookie"');
    }
  });
});
