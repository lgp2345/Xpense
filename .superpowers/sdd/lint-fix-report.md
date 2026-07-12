# Shared 测试导入排序 lint 修复报告

## RED 复现

命令：

```text
pnpm --filter @xpense/shared lint
```

实际输出：

```text
src/foundation.test.ts:3:1 assist/source/organizeImports FIXABLE
× Sort the imported names.
- ReadinessResponseSchema,
- makeHelloMessage,
+ makeHelloMessage,
+ ReadinessResponseSchema,
Found 1 error.
```

## 修复

仅修改 `packages/shared/src/foundation.test.ts` 的导入顺序，将 `makeHelloMessage` 调整到 `ReadinessResponseSchema` 之前；未改变测试语义或其他代码。

## 验证命令与实际输出

### Lint

命令：`pnpm --filter @xpense/shared lint`

输出：`Checked 5 files in 2ms. No fixes applied.`

### 目标测试

命令：`pnpm --filter @xpense/shared exec vitest run src/foundation.test.ts`

输出：`Test Files 1 passed (1)`、`Tests 3 passed (3)`。

### TypeScript 检查

命令：`pnpm --filter @xpense/shared check`

输出：`tsc --noEmit`，退出码 0，无错误输出。

### Diff 空白检查

命令：`git diff --check`

输出：无输出，退出码 0。

## 文件范围

- `packages/shared/src/foundation.test.ts`
- `.superpowers/sdd/lint-fix-report.md`

未修改、删除或回滚其他已有文件或改动。
