import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import type * as TypeScript from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import { ROUTE_REGISTRY } from "./route-registry";

const require = createRequire(import.meta.url);
const ts: typeof TypeScript = require("typescript");

describe("ROUTE_REGISTRY", () => {
  it("registers every shared route key exactly once", () => {
    expect(Object.keys(ROUTE_REGISTRY).sort()).toEqual(Object.keys(ROUTE_DEFINITIONS).sort());
  });

  it.each(
    Object.keys(ROUTE_DEFINITIONS) as RouteKey[],
  )("keeps the exact shared path and routeKey metadata for %s", (routeKey) => {
    const registration = ROUTE_REGISTRY[routeKey];

    expect((registration.route.options as { path?: string }).path).toBe(
      ROUTE_DEFINITIONS[routeKey].path,
    );
    expect(registration.route.options.staticData).toEqual({ routeKey });
  });

  it("retains TanStack's typed params and validated audit-log search", () => {
    // biome-ignore lint/complexity/noBannedTypes: TanStack uses {} for a static route with no params.
    expectTypeOf<typeof ROUTE_REGISTRY.Members.route.types.allParams>().toEqualTypeOf<{}>();
    expectTypeOf<
      typeof ROUTE_REGISTRY.AuditLogs.route.types.fullSearchSchema
    >().toEqualTypeOf<AuditLogSearch>();
    expectTypeOf<Parameters<typeof ROUTE_REGISTRY.AuditLogs.render>[0]["params"]>().toEqualTypeOf<
      typeof ROUTE_REGISTRY.AuditLogs.route.types.allParams
    >();
    expectTypeOf<
      Parameters<typeof ROUTE_REGISTRY.AuditLogs.render>[0]["search"]
    >().toEqualTypeOf<AuditLogSearch>();

    const validateSearch = ROUTE_REGISTRY.AuditLogs.route.options.validateSearch;

    expect(typeof validateSearch).toBe("function");
    if (typeof validateSearch !== "function") {
      return;
    }

    expect(
      validateSearch({
        action: "role.created",
        actorUserId: "user-1",
        from: "2026-08-01",
        page: "2",
        targetType: "role",
        to: "2026-08-12",
      }),
    ).toEqual({
      action: "role.created",
      actorUserId: "user-1",
      from: "2026-08-01",
      page: 2,
      targetType: "role",
      to: "2026-08-12",
    });
  });

  it("keeps every page module behind a React.lazy dynamic import", () => {
    const expectedPageModules = new Set([
      "../features/audit/audit-logs-page",
      "../features/members/members-page",
      "../features/roles/roles-page",
      "../features/sessions/sessions-page",
      "../pages/dashboard-page",
    ]);
    const sourceText = readFileSync(resolve("src/routes/route-registry.tsx"), "utf8");
    const sourceFile = ts.createSourceFile(
      "route-registry.tsx",
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const staticallyImportedPageModules = new Set<string>();
    const lazilyImportedPageModules = new Set<string>();

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        expectedPageModules.has(statement.moduleSpecifier.text) &&
        !statement.importClause?.isTypeOnly
      ) {
        staticallyImportedPageModules.add(statement.moduleSpecifier.text);
      }
    }

    function visit(node: TypeScript.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "lazy"
      ) {
        const lazyFactory = node.arguments[0];

        if (lazyFactory) {
          const collectDynamicImports = (child: TypeScript.Node) => {
            if (
              ts.isCallExpression(child) &&
              child.expression.kind === ts.SyntaxKind.ImportKeyword &&
              child.arguments[0] &&
              ts.isStringLiteral(child.arguments[0]) &&
              expectedPageModules.has(child.arguments[0].text)
            ) {
              lazilyImportedPageModules.add(child.arguments[0].text);
            }
            ts.forEachChild(child, collectDynamicImports);
          };

          collectDynamicImports(lazyFactory);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    expect(staticallyImportedPageModules).toEqual(new Set());
    expect(lazilyImportedPageModules).toEqual(expectedPageModules);
  });
});
