CREATE TYPE "rental_billing_anchor" AS ENUM('contract_start', 'calendar_month');--> statement-breakpoint
CREATE TYPE "rental_contract_change_type" AS ENUM('parties_changed');--> statement-breakpoint
CREATE TYPE "rental_contract_status" AS ENUM('draft', 'confirmed', 'cancelled', 'terminated');--> statement-breakpoint
CREATE TYPE "rental_deposit_calculation_mode" AS ENUM('fixed_amount', 'rent_multiple');--> statement-breakpoint
CREATE TYPE "rental_deposit_type" AS ENUM('rental', 'utility', 'access_card', 'other');--> statement-breakpoint
CREATE TYPE "rental_gender" AS ENUM('male', 'female', 'unspecified');--> statement-breakpoint
CREATE TYPE "rental_identity_document_type" AS ENUM('national_id', 'passport', 'residence_permit', 'business_registration', 'other');--> statement-breakpoint
CREATE TYPE "rental_tenant_type" AS ENUM('individual', 'company');--> statement-breakpoint
CREATE TABLE "rental_contract_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" "rental_contract_change_type" NOT NULL,
	"effective_date" date NOT NULL,
	"reason" text NOT NULL,
	"before_party_refs" jsonb NOT NULL,
	"after_party_refs" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_contract_deposit_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" "rental_deposit_type" NOT NULL,
	"custom_name" text,
	"calculation_mode" "rental_deposit_calculation_mode" NOT NULL,
	"fixed_amount_minor" bigint,
	"rent_multiple" numeric(12,4),
	"final_amount_minor" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contract_deposit_terms_custom_name_check" CHECK (("type" = 'other' AND "custom_name" IS NOT NULL) OR ("type" <> 'other' AND "custom_name" IS NULL)),
	CONSTRAINT "rental_contract_deposit_terms_calculation_mode_check" CHECK (("calculation_mode" = 'fixed_amount' AND "fixed_amount_minor" IS NOT NULL AND "rent_multiple" IS NULL) OR ("calculation_mode" = 'rent_multiple' AND "fixed_amount_minor" IS NULL AND "rent_multiple" IS NOT NULL)),
	CONSTRAINT "rental_contract_deposit_terms_fixed_amount_minor_check" CHECK ("fixed_amount_minor" IS NULL OR ("fixed_amount_minor" > 0 AND "fixed_amount_minor" <= 9007199254740991)),
	CONSTRAINT "rental_contract_deposit_terms_rent_multiple_check" CHECK ("rent_multiple" IS NULL OR "rent_multiple" > 0),
	CONSTRAINT "rental_contract_deposit_terms_final_amount_minor_check" CHECK ("final_amount_minor" IS NULL OR ("final_amount_minor" > 0 AND "final_amount_minor" <= 9007199254740991))
);
--> statement-breakpoint
CREATE TABLE "rental_contract_number_counters" (
	"organization_id" uuid,
	"year" integer,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contract_number_counters_pkey" PRIMARY KEY("organization_id","year"),
	CONSTRAINT "rental_contract_number_counters_year_check" CHECK ("year" BETWEEN 1 AND 9999),
	CONSTRAINT "rental_contract_number_counters_last_value_check" CHECK ("last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rental_contract_party_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"is_primary_payer" boolean DEFAULT false NOT NULL,
	"tenant_type_snapshot" "rental_tenant_type",
	"tenant_name_snapshot" text,
	"phone_snapshot" text,
	"email_snapshot" text,
	"primary_contact_name_snapshot" text,
	"document_country_code_snapshot" text,
	"document_type_snapshot" "rental_identity_document_type",
	"document_type_other_name_snapshot" text,
	"masked_document_number_snapshot" text,
	"identity_snapshot_ciphertext" bytea,
	"identity_snapshot_key_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contract_party_periods_organization_contract_id_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_contract_party_periods_date_fields_check" CHECK (("valid_from" IS NULL AND "valid_to" IS NULL) OR ("valid_from" IS NOT NULL AND "valid_to" IS NOT NULL AND "valid_from" <= "valid_to")),
	CONSTRAINT "rental_contract_party_periods_snapshot_fields_check" CHECK (("valid_from" IS NULL AND "valid_to" IS NULL AND "tenant_type_snapshot" IS NULL AND "tenant_name_snapshot" IS NULL AND "phone_snapshot" IS NULL AND "email_snapshot" IS NULL AND "primary_contact_name_snapshot" IS NULL AND "document_country_code_snapshot" IS NULL AND "document_type_snapshot" IS NULL AND "document_type_other_name_snapshot" IS NULL AND "masked_document_number_snapshot" IS NULL AND "identity_snapshot_ciphertext" IS NULL AND "identity_snapshot_key_version" IS NULL) OR ("valid_from" IS NOT NULL AND "valid_to" IS NOT NULL AND "tenant_type_snapshot" IS NOT NULL AND "tenant_name_snapshot" IS NOT NULL)),
	CONSTRAINT "rental_contract_party_periods_document_fields_check" CHECK (("document_country_code_snapshot" IS NULL AND "document_type_snapshot" IS NULL AND "masked_document_number_snapshot" IS NULL) OR ("document_country_code_snapshot" IS NOT NULL AND "document_type_snapshot" IS NOT NULL AND "masked_document_number_snapshot" IS NOT NULL)),
	CONSTRAINT "rental_contract_party_periods_document_country_code_check" CHECK ("document_country_code_snapshot" IS NULL OR char_length("document_country_code_snapshot") = 2),
	CONSTRAINT "rental_contract_party_periods_document_type_other_name_check" CHECK (("document_type_snapshot" = 'other' AND "document_type_other_name_snapshot" IS NOT NULL) OR ("document_type_snapshot" IS DISTINCT FROM 'other' AND "document_type_other_name_snapshot" IS NULL)),
	CONSTRAINT "rental_contract_party_periods_identity_snapshot_key_check" CHECK (("identity_snapshot_ciphertext" IS NULL AND "identity_snapshot_key_version" IS NULL) OR ("identity_snapshot_ciphertext" IS NOT NULL AND "identity_snapshot_key_version" > 0))
);
--> statement-breakpoint
CREATE TABLE "rental_contract_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"space_name_snapshot" text,
	"space_code_snapshot" text,
	"space_path_snapshot" jsonb,
	"rent_allocation_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contract_spaces_organization_contract_id_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_contract_spaces_contract_space_unique" UNIQUE("organization_id","contract_id","space_id"),
	CONSTRAINT "rental_contract_spaces_snapshot_fields_check" CHECK (("space_name_snapshot" IS NULL AND "space_code_snapshot" IS NULL AND "space_path_snapshot" IS NULL) OR ("space_name_snapshot" IS NOT NULL AND "space_path_snapshot" IS NOT NULL)),
	CONSTRAINT "rental_contract_spaces_rent_allocation_minor_check" CHECK ("rent_allocation_minor" IS NULL OR ("rent_allocation_minor" > 0 AND "rent_allocation_minor" <= 9007199254740991))
);
--> statement-breakpoint
CREATE TABLE "rental_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"contract_number" text NOT NULL,
	"external_contract_number" text,
	"status" "rental_contract_status" DEFAULT 'draft'::"rental_contract_status" NOT NULL,
	"start_date" date,
	"end_date" date,
	"rent_amount_minor" bigint,
	"billing_anchor" "rental_billing_anchor",
	"payment_interval_months" integer,
	"due_days_before" integer,
	"renewed_from_contract_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"termination_date" date,
	"termination_recorded_at" timestamp with time zone,
	"terminated_by_user_id" uuid,
	"termination_reason" text,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contracts_organization_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "rental_contracts_organization_property_id_unique" UNIQUE("organization_id","property_id","id"),
	CONSTRAINT "rental_contracts_organization_contract_number_unique" UNIQUE("organization_id","contract_number"),
	CONSTRAINT "rental_contracts_date_order_check" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date"),
	CONSTRAINT "rental_contracts_rent_amount_minor_check" CHECK ("rent_amount_minor" IS NULL OR ("rent_amount_minor" > 0 AND "rent_amount_minor" <= 9007199254740991)),
	CONSTRAINT "rental_contracts_payment_interval_months_check" CHECK ("payment_interval_months" IS NULL OR "payment_interval_months" IN (1, 3, 6, 12)),
	CONSTRAINT "rental_contracts_due_days_before_check" CHECK ("due_days_before" IS NULL OR "due_days_before" BETWEEN 0 AND 90),
	CONSTRAINT "rental_contracts_confirmed_core_fields_check" CHECK ("status" = 'draft' OR ("start_date" IS NOT NULL AND "end_date" IS NOT NULL AND "rent_amount_minor" IS NOT NULL AND "billing_anchor" IS NOT NULL AND "payment_interval_months" IS NOT NULL AND "due_days_before" IS NOT NULL)),
	CONSTRAINT "rental_contracts_cancellation_fields_check" CHECK (("cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND "cancellation_reason" IS NULL) OR ("cancelled_at" IS NOT NULL AND "cancelled_by_user_id" IS NOT NULL AND "cancellation_reason" IS NOT NULL)),
	CONSTRAINT "rental_contracts_cancellation_status_check" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)),
	CONSTRAINT "rental_contracts_termination_fields_check" CHECK (("termination_date" IS NULL AND "termination_recorded_at" IS NULL AND "terminated_by_user_id" IS NULL AND "termination_reason" IS NULL) OR ("termination_date" IS NOT NULL AND "termination_recorded_at" IS NOT NULL AND "terminated_by_user_id" IS NOT NULL AND "termination_reason" IS NOT NULL)),
	CONSTRAINT "rental_contracts_termination_status_check" CHECK (("status" = 'terminated') = ("termination_date" IS NOT NULL)),
	CONSTRAINT "rental_contracts_termination_date_check" CHECK ("termination_date" IS NULL OR ("start_date" IS NOT NULL AND "end_date" IS NOT NULL AND "termination_date" BETWEEN "start_date" AND "end_date" AND "termination_date" < "end_date")),
	CONSTRAINT "rental_contracts_deleted_by_user_check" CHECK (("deleted_at" IS NULL AND "deleted_by_user_id" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by_user_id" IS NOT NULL)),
	CONSTRAINT "rental_contracts_only_drafts_soft_delete_check" CHECK ("deleted_at" IS NULL OR "status" = 'draft')
);
--> statement-breakpoint
CREATE TABLE "rental_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"type" "rental_tenant_type" NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"primary_contact_name" text,
	"document_country_code" text,
	"document_type" "rental_identity_document_type",
	"document_type_other_name" text,
	"document_number_lookup_hash" text,
	"masked_document_number" text,
	"sensitive_identity_ciphertext" bytea,
	"sensitive_identity_key_version" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_tenants_organization_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "rental_tenants_document_fields_check" CHECK (("document_country_code" IS NULL AND "document_type" IS NULL AND "document_number_lookup_hash" IS NULL AND "masked_document_number" IS NULL) OR ("document_country_code" IS NOT NULL AND "document_type" IS NOT NULL AND "document_number_lookup_hash" IS NOT NULL AND "masked_document_number" IS NOT NULL)),
	CONSTRAINT "rental_tenants_document_country_code_check" CHECK ("document_country_code" IS NULL OR char_length("document_country_code") = 2),
	CONSTRAINT "rental_tenants_document_type_other_name_check" CHECK (("document_type" = 'other' AND "document_type_other_name" IS NOT NULL) OR ("document_type" IS DISTINCT FROM 'other' AND "document_type_other_name" IS NULL)),
	CONSTRAINT "rental_tenants_sensitive_identity_key_check" CHECK (("sensitive_identity_ciphertext" IS NULL AND "sensitive_identity_key_version" IS NULL) OR ("sensitive_identity_ciphertext" IS NOT NULL AND "sensitive_identity_key_version" > 0)),
	CONSTRAINT "rental_tenants_document_identity_ciphertext_check" CHECK ("document_number_lookup_hash" IS NULL OR ("sensitive_identity_ciphertext" IS NOT NULL AND "sensitive_identity_key_version" IS NOT NULL)),
	CONSTRAINT "rental_tenants_deleted_by_user_check" CHECK (("deleted_at" IS NULL AND "deleted_by_user_id" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "rental_contract_changes_contract_effective_date_idx" ON "rental_contract_changes" ("organization_id","contract_id","effective_date");--> statement-breakpoint
CREATE INDEX "rental_contract_deposit_terms_contract_sort_idx" ON "rental_contract_deposit_terms" ("organization_id","contract_id","sort_order");--> statement-breakpoint
CREATE INDEX "rental_contract_party_periods_contract_validity_idx" ON "rental_contract_party_periods" ("organization_id","contract_id","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "rental_contract_party_periods_tenant_idx" ON "rental_contract_party_periods" ("organization_id","tenant_id");--> statement-breakpoint
CREATE INDEX "rental_contract_spaces_organization_space_idx" ON "rental_contract_spaces" ("organization_id","space_id");--> statement-breakpoint
CREATE INDEX "rental_contracts_organization_property_deleted_idx" ON "rental_contracts" ("organization_id","property_id","deleted_at");--> statement-breakpoint
CREATE INDEX "rental_contracts_organization_status_dates_idx" ON "rental_contracts" ("organization_id","status","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_tenants_active_document_hash_unique" ON "rental_tenants" ("organization_id","document_number_lookup_hash") WHERE "deleted_at" IS NULL AND "document_number_lookup_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rental_tenants_organization_deleted_name_idx" ON "rental_tenants" ("organization_id","deleted_at","name");--> statement-breakpoint
ALTER TABLE "rental_contract_changes" ADD CONSTRAINT "rental_contract_changes_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_changes" ADD CONSTRAINT "rental_contract_changes_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_changes" ADD CONSTRAINT "rental_contract_changes_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_contract_deposit_terms" ADD CONSTRAINT "rental_contract_deposit_terms_rByso3MKXk3T_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_deposit_terms" ADD CONSTRAINT "rental_contract_deposit_terms_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_contract_number_counters" ADD CONSTRAINT "rental_contract_number_counters_MvFYH921Wavc_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_party_periods" ADD CONSTRAINT "rental_contract_party_periods_BOd1h5rZ1PwM_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_party_periods" ADD CONSTRAINT "rental_contract_party_periods_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_contract_party_periods" ADD CONSTRAINT "rental_contract_party_periods_tenant_scope_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "rental_tenants"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_contract_spaces" ADD CONSTRAINT "rental_contract_spaces_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_spaces" ADD CONSTRAINT "rental_contract_spaces_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id","property_id") REFERENCES "rental_contracts"("organization_id","id","property_id");--> statement-breakpoint
ALTER TABLE "rental_contract_spaces" ADD CONSTRAINT "rental_contract_spaces_space_scope_fk" FOREIGN KEY ("organization_id","property_id","space_id") REFERENCES "rental_spaces"("organization_id","property_id","id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_cancelled_by_user_id_users_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_terminated_by_user_id_users_id_fkey" FOREIGN KEY ("terminated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_property_scope_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "rental_properties"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_renewed_from_scope_fk" FOREIGN KEY ("organization_id","property_id","renewed_from_contract_id") REFERENCES "rental_contracts"("organization_id","property_id","id");--> statement-breakpoint
ALTER TABLE "rental_tenants" ADD CONSTRAINT "rental_tenants_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_tenants" ADD CONSTRAINT "rental_tenants_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_tenants" ADD CONSTRAINT "rental_tenants_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_tenants" ADD CONSTRAINT "rental_tenants_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");

INSERT INTO "permissions" ("key", "name", "resource", "action", "description")
VALUES
  ('rental_tenants:read', 'rental_tenants:read', 'rental_tenants', 'read', 'rental_tenants:read'),
  ('rental_tenants:create', 'rental_tenants:create', 'rental_tenants', 'create', 'rental_tenants:create'),
  ('rental_tenants:update', 'rental_tenants:update', 'rental_tenants', 'update', 'rental_tenants:update'),
  ('rental_tenants:delete', 'rental_tenants:delete', 'rental_tenants', 'delete', 'rental_tenants:delete'),
  ('rental_tenants:sensitive_read', 'rental_tenants:sensitive_read', 'rental_tenants', 'sensitive_read', 'rental_tenants:sensitive_read'),
  ('rental_contracts:read', 'rental_contracts:read', 'rental_contracts', 'read', 'rental_contracts:read'),
  ('rental_contracts:create', 'rental_contracts:create', 'rental_contracts', 'create', 'rental_contracts:create'),
  ('rental_contracts:update', 'rental_contracts:update', 'rental_contracts', 'update', 'rental_contracts:update'),
  ('rental_contracts:delete', 'rental_contracts:delete', 'rental_contracts', 'delete', 'rental_contracts:delete')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON (
  ("roles"."key" IN ('owner', 'admin')
    AND "permissions"."key" IN (
      'rental_tenants:read',
      'rental_tenants:create',
      'rental_tenants:update',
      'rental_tenants:delete',
      'rental_tenants:sensitive_read',
      'rental_contracts:read',
      'rental_contracts:create',
      'rental_contracts:update',
      'rental_contracts:delete'
    ))
  OR ("roles"."key" IN ('member', 'viewer')
    AND "permissions"."key" IN ('rental_tenants:read', 'rental_contracts:read'))
)
WHERE "roles"."is_system" IS TRUE
  AND "roles"."organization_id" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

DO $$
DECLARE
  organization_row record;
  rental_directory_id integer;
  tenant_menu_id integer;
  contract_menu_id integer;
  menu_id integer;
  button_row record;
BEGIN
  FOR organization_row IN SELECT "id" FROM "organizations" LOOP
    rental_directory_id := NULL;
    SELECT "id" INTO rental_directory_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id"
      AND "type" = 'directory'
      AND "parent_id" IS NULL
      AND "name" = '租赁管理'
    ORDER BY "id"
    LIMIT 1;

    IF rental_directory_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
        "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
      ) VALUES (
        organization_row."id", 'directory', '租赁管理', NULL, NULL, NULL, 'Building2',
        NULL, NULL, TRUE, NULL, 8
      ) RETURNING "id" INTO rental_directory_id;
    END IF;

    tenant_menu_id := NULL;
    SELECT "id" INTO tenant_menu_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalTenants'
    LIMIT 1;

    IF tenant_menu_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
        "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
      ) VALUES (
        organization_row."id", 'menu', '租户管理', rental_directory_id, 'RentalTenants', NULL,
        'Users', 'rental_tenants:read', FALSE, TRUE, TRUE, 10
      ) RETURNING "id" INTO tenant_menu_id;
    END IF;

    menu_id := NULL;
    SELECT "id" INTO menu_id FROM "menus"
    WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalTenantDetail'
    LIMIT 1;
    IF menu_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
        "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
      ) VALUES (
        organization_row."id", 'menu', '租户详情', tenant_menu_id, 'RentalTenantDetail', NULL,
        NULL, 'rental_tenants:read', FALSE, FALSE, FALSE, 0
      );
    END IF;

    FOR button_row IN
      SELECT * FROM (VALUES
        ('新增租户', 'rental_tenants:create', 100),
        ('编辑租户', 'rental_tenants:update', 110),
        ('删除租户', 'rental_tenants:delete', 120),
        ('查看敏感信息', 'rental_tenants:sensitive_read', 130)
      ) AS tenant_buttons(button_name, permission_key, button_sort_order)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM "menus"
        WHERE "organization_id" = organization_row."id"
          AND "type" = 'button'
          AND "parent_id" = tenant_menu_id
          AND "permission_code" = button_row.permission_key
      ) THEN
        INSERT INTO "menus" (
          "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
          "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
        ) VALUES (
          organization_row."id", 'button', button_row.button_name, tenant_menu_id, NULL, NULL,
          NULL, button_row.permission_key, NULL, NULL, NULL, button_row.button_sort_order
        );
      END IF;
    END LOOP;

    contract_menu_id := NULL;
    SELECT "id" INTO contract_menu_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalContracts'
    LIMIT 1;

    IF contract_menu_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
        "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
      ) VALUES (
        organization_row."id", 'menu', '合同管理', rental_directory_id, 'RentalContracts', NULL,
        'ScrollText', 'rental_contracts:read', FALSE, TRUE, TRUE, 20
      ) RETURNING "id" INTO contract_menu_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "menus"
      WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalContractDetail'
    ) THEN
      INSERT INTO "menus" (
        "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
        "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
      ) VALUES (
        organization_row."id", 'menu', '合同详情', contract_menu_id, 'RentalContractDetail', NULL,
        NULL, 'rental_contracts:read', FALSE, FALSE, FALSE, 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "menus"
      WHERE "organization_id" = organization_row."id" AND "route_key" = 'RentalContractCreate'
    ) THEN
      INSERT INTO "menus" (
        "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
        "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
      ) VALUES (
        organization_row."id", 'menu', '新增合同页面', contract_menu_id, 'RentalContractCreate', NULL,
        NULL, 'rental_contracts:create', FALSE, FALSE, FALSE, 10
      );
    END IF;

    FOR button_row IN
      SELECT * FROM (VALUES
        ('新增合同', 'rental_contracts:create', 100),
        ('编辑合同', 'rental_contracts:update', 110),
        ('删除合同', 'rental_contracts:delete', 120)
      ) AS contract_buttons(button_name, permission_key, button_sort_order)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM "menus"
        WHERE "organization_id" = organization_row."id"
          AND "type" = 'button'
          AND "parent_id" = contract_menu_id
          AND "permission_code" = button_row.permission_key
      ) THEN
        INSERT INTO "menus" (
          "organization_id", "type", "name", "parent_id", "route_key", "path", "icon",
          "permission_code", "is_external", "is_visible", "keep_alive", "sort_order"
        ) VALUES (
          organization_row."id", 'button', button_row.button_name, contract_menu_id, NULL, NULL,
          NULL, button_row.permission_key, NULL, NULL, NULL, button_row.button_sort_order
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON TYPE "rental_billing_anchor" IS '租赁合同计费周期锚点';
COMMENT ON TYPE "rental_contract_change_type" IS '租赁合同变更类型';
COMMENT ON TYPE "rental_contract_status" IS '租赁合同持久化生命周期状态';
COMMENT ON TYPE "rental_deposit_calculation_mode" IS '租赁合同押金计算方式';
COMMENT ON TYPE "rental_deposit_type" IS '租赁合同押金项目类型';
COMMENT ON TYPE "rental_gender" IS '租户敏感身份信息中的性别';
COMMENT ON TYPE "rental_identity_document_type" IS '租户主要身份证件类型';
COMMENT ON TYPE "rental_tenant_type" IS '租赁租户类型';

COMMENT ON TABLE "rental_contract_changes" IS '租赁合同承租方变更记录';
COMMENT ON COLUMN "rental_contract_changes"."id" IS '合同变更记录主键 UUID';
COMMENT ON COLUMN "rental_contract_changes"."organization_id" IS '合同变更所属组织 ID';
COMMENT ON COLUMN "rental_contract_changes"."contract_id" IS '发生承租方变更的合同 ID';
COMMENT ON COLUMN "rental_contract_changes"."type" IS '合同变更类型';
COMMENT ON COLUMN "rental_contract_changes"."effective_date" IS '合同变更生效日期';
COMMENT ON COLUMN "rental_contract_changes"."reason" IS '合同变更原因';
COMMENT ON COLUMN "rental_contract_changes"."before_party_refs" IS '变更前承租方引用快照';
COMMENT ON COLUMN "rental_contract_changes"."after_party_refs" IS '变更后承租方引用快照';
COMMENT ON COLUMN "rental_contract_changes"."created_by_user_id" IS '记录合同变更的用户 ID';
COMMENT ON COLUMN "rental_contract_changes"."created_at" IS '合同变更记录创建时间';

COMMENT ON TABLE "rental_contract_deposit_terms" IS '租赁合同押金约定';
COMMENT ON COLUMN "rental_contract_deposit_terms"."id" IS '押金约定主键 UUID';
COMMENT ON COLUMN "rental_contract_deposit_terms"."organization_id" IS '押金约定所属组织 ID';
COMMENT ON COLUMN "rental_contract_deposit_terms"."contract_id" IS '押金约定所属合同 ID';
COMMENT ON COLUMN "rental_contract_deposit_terms"."type" IS '押金项目类型';
COMMENT ON COLUMN "rental_contract_deposit_terms"."custom_name" IS '其他押金项目的自定义名称';
COMMENT ON COLUMN "rental_contract_deposit_terms"."calculation_mode" IS '押金计算方式';
COMMENT ON COLUMN "rental_contract_deposit_terms"."fixed_amount_minor" IS '固定押金金额，使用最小货币单位';
COMMENT ON COLUMN "rental_contract_deposit_terms"."rent_multiple" IS '按租金计算押金时使用的倍数';
COMMENT ON COLUMN "rental_contract_deposit_terms"."final_amount_minor" IS '确认后的最终押金金额，使用最小货币单位';
COMMENT ON COLUMN "rental_contract_deposit_terms"."sort_order" IS '押金项目升序排序值';
COMMENT ON COLUMN "rental_contract_deposit_terms"."created_at" IS '押金约定创建时间';
COMMENT ON COLUMN "rental_contract_deposit_terms"."updated_at" IS '押金约定最后更新时间';

COMMENT ON TABLE "rental_contract_number_counters" IS '组织年度租赁合同编号计数器';
COMMENT ON COLUMN "rental_contract_number_counters"."organization_id" IS '合同编号计数器所属组织 ID';
COMMENT ON COLUMN "rental_contract_number_counters"."year" IS '合同编号所属公历年份';
COMMENT ON COLUMN "rental_contract_number_counters"."last_value" IS '该组织年度已分配的最后序号';
COMMENT ON COLUMN "rental_contract_number_counters"."updated_at" IS '合同编号计数器最后更新时间';

COMMENT ON TABLE "rental_contract_party_periods" IS '租赁合同承租方有效区间与确认快照';
COMMENT ON COLUMN "rental_contract_party_periods"."id" IS '合同承租方区间主键 UUID';
COMMENT ON COLUMN "rental_contract_party_periods"."organization_id" IS '合同承租方区间所属组织 ID';
COMMENT ON COLUMN "rental_contract_party_periods"."contract_id" IS '承租方区间所属合同 ID';
COMMENT ON COLUMN "rental_contract_party_periods"."tenant_id" IS '承租方对应的租户主档 ID';
COMMENT ON COLUMN "rental_contract_party_periods"."valid_from" IS '承租方有效期开始日期';
COMMENT ON COLUMN "rental_contract_party_periods"."valid_to" IS '承租方有效期结束日期';
COMMENT ON COLUMN "rental_contract_party_periods"."is_primary_payer" IS '是否为该区间内的主要付款人';
COMMENT ON COLUMN "rental_contract_party_periods"."tenant_type_snapshot" IS '确认时固化的租户类型';
COMMENT ON COLUMN "rental_contract_party_periods"."tenant_name_snapshot" IS '确认时固化的租户名称';
COMMENT ON COLUMN "rental_contract_party_periods"."phone_snapshot" IS '确认时固化的联系电话';
COMMENT ON COLUMN "rental_contract_party_periods"."email_snapshot" IS '确认时固化的电子邮箱';
COMMENT ON COLUMN "rental_contract_party_periods"."primary_contact_name_snapshot" IS '确认时固化的主要联系人姓名';
COMMENT ON COLUMN "rental_contract_party_periods"."document_country_code_snapshot" IS '确认时固化的证件签发国家或地区代码';
COMMENT ON COLUMN "rental_contract_party_periods"."document_type_snapshot" IS '确认时固化的证件类型';
COMMENT ON COLUMN "rental_contract_party_periods"."document_type_other_name_snapshot" IS '确认时固化的其他证件类型名称';
COMMENT ON COLUMN "rental_contract_party_periods"."masked_document_number_snapshot" IS '确认时固化的证件号码展示掩码';
COMMENT ON COLUMN "rental_contract_party_periods"."identity_snapshot_ciphertext" IS '确认时固化的敏感身份加密快照';
COMMENT ON COLUMN "rental_contract_party_periods"."identity_snapshot_key_version" IS '敏感身份加密快照使用的密钥版本';
COMMENT ON COLUMN "rental_contract_party_periods"."created_at" IS '合同承租方区间创建时间';

COMMENT ON TABLE "rental_contract_spaces" IS '租赁合同关联空间与确认快照';
COMMENT ON COLUMN "rental_contract_spaces"."id" IS '合同空间关系主键 UUID';
COMMENT ON COLUMN "rental_contract_spaces"."organization_id" IS '合同空间关系所属组织 ID';
COMMENT ON COLUMN "rental_contract_spaces"."contract_id" IS '空间关系所属合同 ID';
COMMENT ON COLUMN "rental_contract_spaces"."property_id" IS '合同及空间共同所属的房产 ID';
COMMENT ON COLUMN "rental_contract_spaces"."space_id" IS '合同关联的租赁空间 ID';
COMMENT ON COLUMN "rental_contract_spaces"."space_name_snapshot" IS '确认时固化的空间名称';
COMMENT ON COLUMN "rental_contract_spaces"."space_code_snapshot" IS '确认时固化的空间业务编码';
COMMENT ON COLUMN "rental_contract_spaces"."space_path_snapshot" IS '确认时固化的空间层级路径';
COMMENT ON COLUMN "rental_contract_spaces"."rent_allocation_minor" IS '分配到该空间的租金，使用最小货币单位';
COMMENT ON COLUMN "rental_contract_spaces"."created_at" IS '合同空间关系创建时间';

COMMENT ON TABLE "rental_contracts" IS '租赁合同主档';
COMMENT ON COLUMN "rental_contracts"."id" IS '租赁合同主键 UUID';
COMMENT ON COLUMN "rental_contracts"."organization_id" IS '租赁合同所属组织 ID';
COMMENT ON COLUMN "rental_contracts"."property_id" IS '租赁合同所属房产 ID';
COMMENT ON COLUMN "rental_contracts"."contract_number" IS '组织内唯一的合同内部编号';
COMMENT ON COLUMN "rental_contracts"."external_contract_number" IS '可选的外部合同编号';
COMMENT ON COLUMN "rental_contracts"."status" IS '合同持久化生命周期状态';
COMMENT ON COLUMN "rental_contracts"."start_date" IS '合同租期开始日期';
COMMENT ON COLUMN "rental_contracts"."end_date" IS '合同原定租期结束日期';
COMMENT ON COLUMN "rental_contracts"."rent_amount_minor" IS '合同周期租金，使用最小货币单位';
COMMENT ON COLUMN "rental_contracts"."billing_anchor" IS '合同计费周期锚点';
COMMENT ON COLUMN "rental_contracts"."payment_interval_months" IS '合同付款间隔月数';
COMMENT ON COLUMN "rental_contracts"."due_days_before" IS '付款到期日前置天数';
COMMENT ON COLUMN "rental_contracts"."renewed_from_contract_id" IS '本合同续租来源合同 ID';
COMMENT ON COLUMN "rental_contracts"."cancelled_at" IS '合同取消记录时间';
COMMENT ON COLUMN "rental_contracts"."cancelled_by_user_id" IS '执行合同取消的用户 ID';
COMMENT ON COLUMN "rental_contracts"."cancellation_reason" IS '合同取消原因';
COMMENT ON COLUMN "rental_contracts"."termination_date" IS '合同提前终止生效日期';
COMMENT ON COLUMN "rental_contracts"."termination_recorded_at" IS '合同提前终止记录时间';
COMMENT ON COLUMN "rental_contracts"."terminated_by_user_id" IS '记录合同提前终止的用户 ID';
COMMENT ON COLUMN "rental_contracts"."termination_reason" IS '合同提前终止原因';
COMMENT ON COLUMN "rental_contracts"."note" IS '合同业务备注';
COMMENT ON COLUMN "rental_contracts"."created_by_user_id" IS '创建合同的用户 ID';
COMMENT ON COLUMN "rental_contracts"."updated_by_user_id" IS '最后更新合同的用户 ID';
COMMENT ON COLUMN "rental_contracts"."deleted_at" IS '合同草稿软删除时间';
COMMENT ON COLUMN "rental_contracts"."deleted_by_user_id" IS '执行合同草稿软删除的用户 ID';
COMMENT ON COLUMN "rental_contracts"."created_at" IS '合同创建时间';
COMMENT ON COLUMN "rental_contracts"."updated_at" IS '合同最后更新时间';

COMMENT ON TABLE "rental_tenants" IS '组织级租赁租户主档';
COMMENT ON COLUMN "rental_tenants"."id" IS '租赁租户主键 UUID';
COMMENT ON COLUMN "rental_tenants"."organization_id" IS '租赁租户所属组织 ID';
COMMENT ON COLUMN "rental_tenants"."type" IS '租赁租户类型';
COMMENT ON COLUMN "rental_tenants"."name" IS '租户个人姓名或企业名称';
COMMENT ON COLUMN "rental_tenants"."phone" IS '租户联系电话';
COMMENT ON COLUMN "rental_tenants"."email" IS '租户电子邮箱';
COMMENT ON COLUMN "rental_tenants"."primary_contact_name" IS '企业租户主要联系人姓名';
COMMENT ON COLUMN "rental_tenants"."document_country_code" IS '主要证件签发国家或地区代码';
COMMENT ON COLUMN "rental_tenants"."document_type" IS '主要证件类型';
COMMENT ON COLUMN "rental_tenants"."document_type_other_name" IS '其他证件类型的自定义名称';
COMMENT ON COLUMN "rental_tenants"."document_number_lookup_hash" IS '组织作用域内证件号码检索摘要';
COMMENT ON COLUMN "rental_tenants"."masked_document_number" IS '由证件号码派生的展示掩码，不保存证件号码明文';
COMMENT ON COLUMN "rental_tenants"."sensitive_identity_ciphertext" IS '租户敏感身份信息加密载荷';
COMMENT ON COLUMN "rental_tenants"."sensitive_identity_key_version" IS '敏感身份信息加密密钥版本';
COMMENT ON COLUMN "rental_tenants"."is_active" IS '租户是否可用于新的租赁业务';
COMMENT ON COLUMN "rental_tenants"."note" IS '租户业务备注';
COMMENT ON COLUMN "rental_tenants"."created_by_user_id" IS '创建租户主档的用户 ID';
COMMENT ON COLUMN "rental_tenants"."updated_by_user_id" IS '最后更新租户主档的用户 ID';
COMMENT ON COLUMN "rental_tenants"."deleted_at" IS '租户主档软删除时间';
COMMENT ON COLUMN "rental_tenants"."deleted_by_user_id" IS '执行租户主档软删除的用户 ID';
COMMENT ON COLUMN "rental_tenants"."created_at" IS '租户主档创建时间';
COMMENT ON COLUMN "rental_tenants"."updated_at" IS '租户主档最后更新时间';
