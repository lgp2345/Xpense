ALTER TABLE "account_movements" DROP CONSTRAINT "account_movements_organization_transaction_fk";--> statement-breakpoint
ALTER TABLE "account_movements" DROP CONSTRAINT "account_movements_organization_account_fk";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_organization_ledger_fk";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_organization_ledger_fk";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_scope_fk";--> statement-breakpoint
ALTER TABLE "rental_properties" DROP CONSTRAINT "rental_properties_organization_ledger_fk";--> statement-breakpoint
DROP TABLE "account_movements";--> statement-breakpoint
DROP TABLE "accounts";--> statement-breakpoint
DROP TABLE "categories";--> statement-breakpoint
DROP TABLE "ledgers";--> statement-breakpoint
DROP TABLE "transactions";--> statement-breakpoint
ALTER TABLE "rental_properties" DROP CONSTRAINT "rental_properties_organization_ledger_unique";--> statement-breakpoint
ALTER TABLE "rental_properties" DROP COLUMN "ledger_id";--> statement-breakpoint
DROP TYPE "account_type";--> statement-breakpoint
DROP TYPE "category_type";--> statement-breakpoint
DROP TYPE "ledger_type";--> statement-breakpoint
DROP TYPE "transaction_type";
--> statement-breakpoint
-- 只移除记账节点及已失去页面归属的按钮；保留挂在旧页面下的其他业务子树。
DO $$
DECLARE
  retired_ids integer[];
BEGIN
  SELECT coalesce(array_agg("id"), ARRAY[]::integer[]) INTO retired_ids
  FROM "menus"
  WHERE "route_key" IN ('Accounts', 'Categories', 'Transactions')
    OR split_part("permission_code", ':', 1) IN ('ledgers', 'accounts', 'categories', 'transactions', 'statistics')
    OR ("type" = 'directory' AND "name" = '记账管理');

  SELECT coalesce(array_agg("id"), ARRAY[]::integer[]) INTO retired_ids
  FROM "menus"
  WHERE "id" = ANY(retired_ids)
    OR ("type" = 'button' AND "parent_id" = ANY(retired_ids));

  WITH RECURSIVE surviving_parent AS (
    SELECT child."id", child."organization_id", parent."parent_id" AS candidate_parent_id
    FROM "menus" child
    JOIN "menus" parent
      ON parent."organization_id" = child."organization_id" AND parent."id" = child."parent_id"
    WHERE child."id" <> ALL(retired_ids) AND parent."id" = ANY(retired_ids)
    UNION
    SELECT child."id", child."organization_id", parent."parent_id"
    FROM surviving_parent child
    JOIN "menus" parent
      ON parent."organization_id" = child."organization_id" AND parent."id" = child.candidate_parent_id
    WHERE parent."id" = ANY(retired_ids)
  )
  UPDATE "menus" child
  SET "parent_id" = parent.candidate_parent_id, "updated_at" = now()
  FROM surviving_parent parent
  WHERE child."organization_id" = parent."organization_id" AND child."id" = parent."id"
    AND (parent.candidate_parent_id IS NULL OR parent.candidate_parent_id <> ALL(retired_ids));

  DELETE FROM "menus" WHERE "id" = ANY(retired_ids);
END $$;
--> statement-breakpoint
DELETE FROM "role_permissions" grant_row USING "permissions" permission
WHERE grant_row."permission_id" = permission."id"
  AND split_part(permission."key", ':', 1) IN ('ledgers', 'accounts', 'categories', 'transactions', 'statistics');
--> statement-breakpoint
DELETE FROM "permissions"
WHERE split_part("key", ':', 1) IN ('ledgers', 'accounts', 'categories', 'transactions', 'statistics');
--> statement-breakpoint
COMMENT ON TABLE "rental_properties" IS '组织内独立管理的租赁房产';
