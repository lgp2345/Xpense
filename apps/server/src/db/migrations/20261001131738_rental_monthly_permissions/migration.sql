-- Custom SQL migration file, put your code below! --
-- 为月度租赁财务能力增量登记权限，并只赋予既有系统 owner/admin。
INSERT INTO "permissions" ("key", "name", "resource", "action", "description") VALUES
  ('rental_charges:read', 'rental_charges:read', 'rental_charges', 'read', 'rental_charges:read'),
  ('rental_charges:update', 'rental_charges:update', 'rental_charges', 'update', 'rental_charges:update'),
  ('rental_meters:read', 'rental_meters:read', 'rental_meters', 'read', 'rental_meters:read'),
  ('rental_meters:update', 'rental_meters:update', 'rental_meters', 'update', 'rental_meters:update'),
  ('rental_monthly_bills:generate', 'rental_monthly_bills:generate', 'rental_monthly_bills', 'generate', 'rental_monthly_bills:generate'),
  ('rental_monthly_bills:adjust', 'rental_monthly_bills:adjust', 'rental_monthly_bills', 'adjust', 'rental_monthly_bills:adjust'),
  ('rental_receipts:create', 'rental_receipts:create', 'rental_receipts', 'create', 'rental_receipts:create'),
  ('rental_receipts:revoke', 'rental_receipts:revoke', 'rental_receipts', 'revoke', 'rental_receipts:revoke'),
  ('rental_refunds:create', 'rental_refunds:create', 'rental_refunds', 'create', 'rental_refunds:create'),
  ('rental_refunds:revoke', 'rental_refunds:revoke', 'rental_refunds', 'revoke', 'rental_refunds:revoke'),
  ('rental_settlements:read', 'rental_settlements:read', 'rental_settlements', 'read', 'rental_settlements:read'),
  ('rental_settlements:confirm', 'rental_settlements:confirm', 'rental_settlements', 'confirm', 'rental_settlements:confirm')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = TRUE
  AND r."organization_id" IS NULL
  AND r."key" IN ('owner', 'admin')
  AND p."key" IN (
    'rental_charges:read',
    'rental_charges:update',
    'rental_meters:read',
    'rental_meters:update',
    'rental_monthly_bills:generate',
    'rental_monthly_bills:adjust',
    'rental_receipts:create',
    'rental_receipts:revoke',
    'rental_refunds:create',
    'rental_refunds:revoke',
    'rental_settlements:read',
    'rental_settlements:confirm'
  )
ON CONFLICT DO NOTHING;
