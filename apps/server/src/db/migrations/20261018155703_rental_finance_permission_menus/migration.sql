-- 为既有组织补齐账期财务权限和菜单；不重置菜单，不改变自定义角色授权。
-- 外层事务由 Drizzle migrator 管理。
INSERT INTO "permissions" ("key", "name", "resource", "action", "description")
SELECT code, code, split_part(code, ':', 1), split_part(code, ':', 2), code
FROM (VALUES
  ('rental_spaces:read'),
  ('rental_charges:read'), ('rental_charges:update'),
  ('rental_meters:read'), ('rental_meters:update'),
  ('rental_period_bills:generate'), ('rental_period_bills:void'),
  ('rental_receipts:create'), ('rental_receipts:revoke'),
  ('rental_refunds:create'), ('rental_refunds:revoke'),
  ('rental_settlements:read'), ('rental_settlements:confirm')
) AS catalog(code)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- 与 seed 的系统角色策略一致，仅 owner/admin 自动获得这些权限。
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."is_system" = TRUE AND r."organization_id" IS NULL
  AND r."key" IN ('owner', 'admin')
  AND p."key" IN (
    'rental_spaces:read',
    'rental_charges:read', 'rental_charges:update',
    'rental_meters:read', 'rental_meters:update',
    'rental_period_bills:generate', 'rental_period_bills:void',
    'rental_receipts:create', 'rental_receipts:revoke',
    'rental_refunds:create', 'rental_refunds:revoke',
    'rental_settlements:read', 'rental_settlements:confirm'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 只在组织已有对应业务页面时追加操作，保留自定义名称、位置及已有权限映射。
WITH actions(permission_code, name, parent_route_key, sort_order) AS (VALUES
  ('rental_spaces:read', '查看空间', 'RentalProperties', 160),
  ('rental_charges:read', '查看收费配置', 'RentalContracts', 130),
  ('rental_charges:update', '编辑收费配置', 'RentalContracts', 140),
  ('rental_meters:read', '查看抄表读数', 'RentalContracts', 150),
  ('rental_meters:update', '录入抄表读数', 'RentalContracts', 160),
  ('rental_period_bills:generate', '按账期生成账单', 'RentalBills', 120),
  ('rental_period_bills:void', '作废账期账单', 'RentalBills', 130),
  ('rental_receipts:create', '登记收款', 'RentalBills', 140),
  ('rental_receipts:revoke', '撤销收款', 'RentalBills', 150),
  ('rental_refunds:create', '登记退款', 'RentalBills', 160),
  ('rental_refunds:revoke', '撤销退款', 'RentalBills', 170)
), parents AS (
  SELECT DISTINCT ON ("organization_id", "route_key") "id", "organization_id", "route_key"
  FROM "menus"
  WHERE "type" = 'menu' AND "is_external" = FALSE
    AND "route_key" IN ('RentalProperties', 'RentalContracts', 'RentalBills')
  ORDER BY "organization_id", "route_key", "id"
)
INSERT INTO "menus" ("organization_id", "parent_id", "type", "name", "permission_code", "sort_order")
SELECT parent."organization_id", parent."id", 'button', action.name, action.permission_code,
  COALESCE((SELECT MAX(sibling."sort_order") FROM "menus" sibling
    WHERE sibling."organization_id" = parent."organization_id" AND sibling."parent_id" = parent."id"), 0) + action.sort_order
FROM actions action JOIN parents parent ON parent."route_key" = action.parent_route_key
WHERE NOT EXISTS (
  SELECT 1 FROM "menus" existing
  WHERE existing."organization_id" = parent."organization_id"
    AND existing."permission_code" = action.permission_code
)
ORDER BY parent."organization_id", parent."id", action.sort_order;
