#!/usr/bin/env bash
set -euo pipefail

# 检查 rbac.ts 中声明的每个权限码是否至少在后端代码中被引用（装饰器、种子数据或权限判断逻辑）。

SHARED_RBAC="packages/shared/src/rbac.ts"
SERVER_SRC="apps/server/src"

if [ ! -f "$SHARED_RBAC" ]; then
  echo "错误：找不到权限码定义文件 $SHARED_RBAC"
  exit 1
fi

echo "正在扫描权限码..."

# 从 rbac.ts 中提取权限码（字符串形式的 "resource:action"）
permissions=$(grep -oE '"[a-z_]+(:[a-z_]+)+"' "$SHARED_RBAC" | tr -d '"' | sort -u)

if [ -z "$permissions" ]; then
  echo "警告：未从 $SHARED_RBAC 解析到任何权限码"
  exit 0
fi

missing_count=0
total_count=0

while IFS= read -r permission; do
  total_count=$((total_count + 1))
  # 在后端源码中搜索权限码引用
  if grep -qR --include="*.ts" "$permission" "$SERVER_SRC"; then
    echo "  ✓ $permission"
  else
    echo "  ✗ $permission — 未在后端代码中被引用"
    missing_count=$((missing_count + 1))
  fi
done <<< "$permissions"

echo ""
echo "结果: $total_count 个权限码, $((total_count - missing_count)) 个已引用, $missing_count 个未引用"

if [ "$missing_count" -gt 0 ]; then
  echo "警告：存在未被后端代码引用的权限码，请确认是否需要添加 @RequirePermission 装饰器"
  exit 1
fi

echo "所有权限码均已在后端代码中被引用。"
