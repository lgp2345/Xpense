CREATE TYPE "rental_bill_line_kind" AS ENUM('rent_period', 'deposit', 'termination_adjustment');--> statement-breakpoint
CREATE TYPE "rental_bill_status" AS ENUM('active', 'voided');--> statement-breakpoint
CREATE TYPE "rental_bill_type" AS ENUM('rent', 'deposit');--> statement-breakpoint
CREATE TABLE "rental_bill_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"termination_date" date NOT NULL,
	"termination_recorded_at" timestamp with time zone NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"original_amount_minor" bigint NOT NULL,
	"reference_amount_minor" bigint NOT NULL,
	"final_amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	CONSTRAINT "rental_bill_adjustments_scope_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_bill_adjustments_dates_check" CHECK ("period_start" <= "termination_date" AND "termination_date" <= "period_end"),
	CONSTRAINT "rental_bill_adjustments_money_check" CHECK ("original_amount_minor" BETWEEN 0 AND 9007199254740991 AND "reference_amount_minor" BETWEEN 0 AND 9007199254740991 AND "final_amount_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "rental_bill_adjustments_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000),
	CONSTRAINT "rental_bill_adjustments_revoke_check" CHECK (("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason" IS NULL) OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND char_length(btrim("revoke_reason")) BETWEEN 1 AND 1000))
);
--> statement-breakpoint
CREATE TABLE "rental_bill_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"source_version" text NOT NULL,
	"origin" text NOT NULL,
	"created_count" integer NOT NULL,
	"existing_count" integer NOT NULL,
	"totals" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_bill_generations_scope_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_bill_generations_request_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "rental_bill_generations_origin_check" CHECK ("origin" IN ('manual', 'termination')),
	CONSTRAINT "rental_bill_generations_count_check" CHECK ("created_count" >= 0 AND "existing_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rental_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"kind" "rental_bill_line_kind" NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"period_start" date,
	"period_end" date,
	"reference_start" date,
	"reference_end" date,
	"covered_days" integer,
	"reference_days" integer,
	"base_rent_amount_minor" bigint,
	"sort_order" integer NOT NULL,
	CONSTRAINT "rental_bill_lines_order_unique" UNIQUE("organization_id","bill_id","sort_order"),
	CONSTRAINT "rental_bill_lines_money_check" CHECK ("amount_minor" BETWEEN -9007199254740991 AND 9007199254740991 AND ("kind" = 'termination_adjustment' OR "amount_minor" >= 0)),
	CONSTRAINT "rental_bill_lines_reference_check" CHECK ("kind" <> 'rent_period' OR ("period_start" IS NOT NULL AND "period_end" >= "period_start" AND "reference_start" IS NOT NULL AND "covered_days" > 0 AND "reference_days" >= "covered_days" AND "base_rent_amount_minor" BETWEEN 1 AND 9007199254740991))
);
--> statement-breakpoint
CREATE TABLE "rental_bill_number_counters" (
	"organization_id" uuid,
	"year" integer,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_bill_number_counters_pkey" PRIMARY KEY("organization_id","year"),
	CONSTRAINT "rental_bill_number_counters_check" CHECK ("year" BETWEEN 1 AND 9999 AND "last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rental_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"bill_number" text NOT NULL,
	"contract_number" text NOT NULL,
	"property_name" text NOT NULL,
	"currency_code" text NOT NULL,
	"type" "rental_bill_type" NOT NULL,
	"status" "rental_bill_status" DEFAULT 'active'::"rental_bill_status" NOT NULL,
	"source_key" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"effective_end" date,
	"due_date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"generation_id" uuid NOT NULL,
	"adjustment_id" uuid,
	"snapshot" jsonb NOT NULL,
	"deposit_source_id" uuid,
	"deposit_snapshot" jsonb,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_bills_scope_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_bills_number_unique" UNIQUE("organization_id","bill_number"),
	CONSTRAINT "rental_bills_amount_check" CHECK ("amount_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "rental_bills_period_check" CHECK (("type" = 'deposit' AND "period_start" IS NULL AND "period_end" IS NULL AND "effective_end" IS NULL) OR ("type" = 'rent' AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL AND "effective_end" IS NOT NULL AND "effective_end" BETWEEN "period_start" AND "period_end")),
	CONSTRAINT "rental_bills_void_check" CHECK (("status" = 'active' AND "voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL) OR ("status" = 'voided' AND "voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rental_bill_adjustments_current_unique" ON "rental_bill_adjustments" ("organization_id","contract_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_bills_active_source_unique" ON "rental_bills" ("organization_id","contract_id","type","source_key") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "rental_bills_filter_idx" ON "rental_bills" ("organization_id","status","due_date","id");--> statement-breakpoint
ALTER TABLE "rental_bill_adjustments" ADD CONSTRAINT "rental_bill_adjustments_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_bill_adjustments" ADD CONSTRAINT "rental_bill_adjustments_revoked_by_user_id_users_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_bill_adjustments" ADD CONSTRAINT "rental_bill_adjustments_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_bill_generations" ADD CONSTRAINT "rental_bill_generations_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_bill_generations" ADD CONSTRAINT "rental_bill_generations_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_bill_lines" ADD CONSTRAINT "rental_bill_lines_bill_scope_fk" FOREIGN KEY ("organization_id","contract_id","bill_id") REFERENCES "rental_bills"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_bill_number_counters" ADD CONSTRAINT "rental_bill_number_counters_ybD0pCRQy6Er_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_voided_by_users_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_contract_scope_fk" FOREIGN KEY ("organization_id","property_id","contract_id") REFERENCES "rental_contracts"("organization_id","property_id","id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_generation_scope_fk" FOREIGN KEY ("organization_id","contract_id","generation_id") REFERENCES "rental_bill_generations"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_adjustment_scope_fk" FOREIGN KEY ("organization_id","contract_id","adjustment_id") REFERENCES "rental_bill_adjustments"("organization_id","contract_id","id");
--> statement-breakpoint
-- 增量权限和菜单，只给既有系统 owner/admin 授权，保留自定义配置。
INSERT INTO "permissions" ("key", "name", "resource", "action", "description") VALUES
  ('rental_bills:read', '查看租赁账单', 'rental_bills', 'read', '查看应收及历史'),
  ('rental_bills:generate', '生成租赁账单', 'rental_bills', 'generate', '手动预览并生成全租期应收'),
  ('rental_bills:adjust', '调整租赁账单', 'rental_bills', 'adjust', '合同生命周期应收联动')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."is_system" = TRUE AND r."organization_id" IS NULL AND r."key" IN ('owner', 'admin')
  AND p."key" IN ('rental_bills:read', 'rental_bills:generate', 'rental_bills:adjust')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE
  organization_row record;
  bill_menu_id integer;
  parent_menu_id integer;
  action_row record;
BEGIN
  FOR organization_row IN SELECT "id" FROM "organizations" LOOP
    bill_menu_id := NULL;
    SELECT "id" INTO bill_menu_id FROM "menus"
      WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalBills' AND "type" = 'menu'
      ORDER BY "id" LIMIT 1;
    IF bill_menu_id IS NULL THEN
      parent_menu_id := NULL;
      SELECT directory."id" INTO parent_menu_id FROM "menus" contract_menu
        JOIN "menus" directory ON directory."id" = contract_menu."parent_id"
          AND directory."organization_id" = contract_menu."organization_id" AND directory."type" = 'directory'
        WHERE contract_menu."organization_id" = organization_row."id" AND contract_menu."route_key" = 'RentalContracts'
        ORDER BY contract_menu."id" LIMIT 1;
      INSERT INTO "menus" ("organization_id", "parent_id", "type", "name", "route_key", "icon", "permission_code", "is_external", "is_visible", "keep_alive", "sort_order")
        VALUES (organization_row."id", parent_menu_id, 'menu', '租赁账单', 'RentalBills', 'ReceiptText', 'rental_bills:read', FALSE, TRUE, TRUE,
          COALESCE((SELECT MAX("sort_order") + 10 FROM "menus" WHERE "organization_id" = organization_row."id" AND "parent_id" IS NOT DISTINCT FROM parent_menu_id), 0))
        RETURNING "id" INTO bill_menu_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "menus" WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalBillDetail') THEN
      INSERT INTO "menus" ("organization_id", "parent_id", "type", "name", "route_key", "permission_code", "is_external", "is_visible", "keep_alive", "sort_order")
        VALUES (organization_row."id", bill_menu_id, 'menu', '账单详情', 'RentalBillDetail', 'rental_bills:read', FALSE, FALSE, FALSE, 0);
    END IF;
    FOR action_row IN SELECT * FROM (VALUES ('rental_bills:generate', '生成账单', 100), ('rental_bills:adjust', '调整账单', 110)) AS actions(permission_code, name, sort_order) LOOP
      IF NOT EXISTS (SELECT 1 FROM "menus" WHERE "organization_id" = organization_row."id" AND "type" = 'button' AND "permission_code" = action_row.permission_code) THEN
        INSERT INTO "menus" ("organization_id", "parent_id", "type", "name", "permission_code", "sort_order")
          VALUES (organization_row."id", bill_menu_id, 'button', action_row.name, action_row.permission_code, action_row.sort_order);
      END IF;
    END LOOP;
  END LOOP;
END $$;
