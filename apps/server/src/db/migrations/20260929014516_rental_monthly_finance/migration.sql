CREATE TABLE "rental_bill_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"bill_snapshot" jsonb NOT NULL,
	"lines_snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_bill_revisions_version_unique" UNIQUE("organization_id","contract_id","bill_id","revision"),
	CONSTRAINT "rental_bill_revisions_amount_check" CHECK ("amount_minor" BETWEEN 0 AND 9007199254740991 AND "revision" >= 1),
	CONSTRAINT "rental_bill_revisions_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "rental_cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"bill_id" uuid,
	"settlement_id" uuid,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	CONSTRAINT "rental_cash_entries_scope_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_cash_entries_target_check" CHECK (("bill_id" IS NOT NULL AND "settlement_id" IS NULL) OR ("bill_id" IS NULL AND "settlement_id" IS NOT NULL)),
	CONSTRAINT "rental_cash_entries_kind_purpose_target_check" CHECK (("kind" = 'receipt' AND "purpose" IN ('bill_receipt', 'deposit_receipt') AND "bill_id" IS NOT NULL) OR ("kind" = 'receipt' AND "purpose" = 'settlement_receipt' AND "settlement_id" IS NOT NULL) OR ("kind" = 'refund' AND "purpose" = 'refund')),
	CONSTRAINT "rental_cash_entries_amount_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "rental_cash_entries_revoke_check" CHECK (("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason" IS NULL) OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND "revoke_reason" IS NOT NULL AND char_length(btrim("revoke_reason")) BETWEEN 1 AND 1000))
);
--> statement-breakpoint
CREATE TABLE "rental_finance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_finance_requests_request_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "rental_finance_requests_key_check" CHECK (char_length(btrim("idempotency_key")) BETWEEN 1 AND 200 AND char_length(btrim("action")) BETWEEN 1 AND 100 AND char_length(btrim("request_hash")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "rental_bill_meter_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"bill_line_id" uuid NOT NULL,
	"kind" "rental_bill_line_kind" NOT NULL,
	"start_reading_id" uuid NOT NULL,
	"end_reading_id" uuid NOT NULL,
	CONSTRAINT "rental_bill_meter_intervals_line_unique" UNIQUE("organization_id","contract_id","bill_line_id"),
	CONSTRAINT "rental_bill_meter_intervals_period_unique" UNIQUE("organization_id","contract_id","space_id","kind","start_reading_id","end_reading_id"),
	CONSTRAINT "rental_bill_meter_intervals_kind_check" CHECK ("kind"::text IN ('water', 'electricity')),
	CONSTRAINT "rental_bill_meter_intervals_distinct_check" CHECK ("start_reading_id" <> "end_reading_id")
);
--> statement-breakpoint
CREATE TABLE "rental_charge_term_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"terms_snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_charge_term_revisions_version_unique" UNIQUE("organization_id","contract_id","version"),
	CONSTRAINT "rental_charge_term_revisions_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "rental_charge_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"water_unit_price" numeric(20,4) NOT NULL,
	"electricity_unit_price" numeric(20,4) NOT NULL,
	"fixed_fees" jsonb DEFAULT '[]' NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_charge_terms_scope_unique" UNIQUE("organization_id","contract_id"),
	CONSTRAINT "rental_charge_terms_version_check" CHECK ("version" >= 1),
	CONSTRAINT "rental_charge_terms_prices_check" CHECK ("water_unit_price" BETWEEN 0 AND 9999999999999999.9999 AND "electricity_unit_price" BETWEEN 0 AND 9999999999999999.9999)
);
--> statement-breakpoint
CREATE TABLE "rental_meter_reading_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"reading_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_meter_reading_revisions_version_unique" UNIQUE("organization_id","contract_id","reading_id","revision"),
	CONSTRAINT "rental_meter_reading_revisions_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "rental_meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" "rental_bill_line_kind" NOT NULL,
	"reading_date" date NOT NULL,
	"reading" numeric(20,4) NOT NULL,
	"predecessor_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_meter_readings_scope_id_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_meter_readings_scope_kind_id_unique" UNIQUE("organization_id","contract_id","space_id","kind","id"),
	CONSTRAINT "rental_meter_readings_predecessor_target_unique" UNIQUE("organization_id","contract_id","space_id","kind","id","predecessor_id"),
	CONSTRAINT "rental_meter_readings_date_unique" UNIQUE("organization_id","contract_id","space_id","kind","reading_date"),
	CONSTRAINT "rental_meter_readings_kind_check" CHECK ("kind"::text IN ('water', 'electricity')),
	CONSTRAINT "rental_meter_readings_value_check" CHECK ("reading" BETWEEN 0 AND 9999999999999999.9999 AND "revision" >= 1 AND ("predecessor_id" IS NULL OR "predecessor_id" <> "id")),
	CONSTRAINT "rental_meter_readings_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "rental_settlement_bills" (
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_settlement_bills_contract_bill_unique" UNIQUE("organization_id","contract_id","bill_id")
);
--> statement-breakpoint
CREATE TABLE "rental_settlement_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_settlement_revisions_version_unique" UNIQUE("organization_id","contract_id","settlement_id","revision")
);
--> statement-breakpoint
CREATE TABLE "rental_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"effective_end_date" date NOT NULL,
	"version" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"final_cost_minor" bigint NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_settlements_scope_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_settlements_contract_current_unique" UNIQUE("organization_id","contract_id"),
	CONSTRAINT "rental_settlements_event_unique" UNIQUE("organization_id","contract_id","event_id"),
	CONSTRAINT "rental_settlements_kind_check" CHECK ("kind" IN ('termination', 'expiry', 'cancellation')),
	CONSTRAINT "rental_settlements_status_check" CHECK ("status" IN ('pending_collection', 'pending_refund', 'settled')),
	CONSTRAINT "rental_settlements_amount_check" CHECK ("final_cost_minor" BETWEEN 0 AND 9007199254740991 AND "revision" >= 1),
	CONSTRAINT "rental_settlements_version_check" CHECK (char_length(btrim("version")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "rental_bill_lines" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "rental_bill_lines" ADD COLUMN "fee_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "rental_bills" ADD COLUMN "model_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_bills" ADD COLUMN "billing_month" text;--> statement-breakpoint
ALTER TABLE "rental_bills" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD COLUMN "billing_mode" text DEFAULT 'legacy_receivable' NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_bill_lines" ADD CONSTRAINT "rental_bill_lines_scope_bill_id_kind_unique" UNIQUE("organization_id","contract_id","bill_id","id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_bills_monthly_current_unique" ON "rental_bills" ("organization_id","contract_id","billing_month") WHERE "status" = 'active' AND "model_version" = 2 AND "billing_month" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_cash_entries_active_deposit_receipt_unique" ON "rental_cash_entries" ("organization_id","contract_id","bill_id") WHERE "purpose" = 'deposit_receipt' AND "revoked_at" IS NULL AND "bill_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rental_cash_entries_bill_occurred_idx" ON "rental_cash_entries" ("organization_id","contract_id","bill_id","occurred_on");--> statement-breakpoint
CREATE INDEX "rental_cash_entries_settlement_occurred_idx" ON "rental_cash_entries" ("organization_id","contract_id","settlement_id","occurred_on");--> statement-breakpoint
CREATE INDEX "rental_finance_requests_contract_created_idx" ON "rental_finance_requests" ("organization_id","contract_id","created_at");--> statement-breakpoint
CREATE INDEX "rental_bill_meter_intervals_bill_idx" ON "rental_bill_meter_intervals" ("organization_id","contract_id","bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_meter_readings_baseline_unique" ON "rental_meter_readings" ("organization_id","contract_id","space_id","kind") WHERE "predecessor_id" IS NULL;--> statement-breakpoint
CREATE INDEX "rental_meter_readings_scope_date_idx" ON "rental_meter_readings" ("organization_id","contract_id","kind","reading_date");--> statement-breakpoint
CREATE INDEX "rental_settlement_bills_settlement_idx" ON "rental_settlement_bills" ("organization_id","contract_id","settlement_id");--> statement-breakpoint
CREATE INDEX "rental_settlements_contract_confirmed_idx" ON "rental_settlements" ("organization_id","contract_id","confirmed_at");--> statement-breakpoint
ALTER TABLE "rental_bill_revisions" ADD CONSTRAINT "rental_bill_revisions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_bill_revisions" ADD CONSTRAINT "rental_bill_revisions_bill_scope_fk" FOREIGN KEY ("organization_id","contract_id","bill_id") REFERENCES "rental_bills"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_cash_entries" ADD CONSTRAINT "rental_cash_entries_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_cash_entries" ADD CONSTRAINT "rental_cash_entries_revoked_by_user_id_users_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_cash_entries" ADD CONSTRAINT "rental_cash_entries_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_cash_entries" ADD CONSTRAINT "rental_cash_entries_bill_scope_fk" FOREIGN KEY ("organization_id","contract_id","bill_id") REFERENCES "rental_bills"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_cash_entries" ADD CONSTRAINT "rental_cash_entries_settlement_scope_fk" FOREIGN KEY ("organization_id","contract_id","settlement_id") REFERENCES "rental_settlements"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_finance_requests" ADD CONSTRAINT "rental_finance_requests_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_finance_requests" ADD CONSTRAINT "rental_finance_requests_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_finance_requests" ADD CONSTRAINT "rental_finance_requests_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_bill_meter_intervals" ADD CONSTRAINT "rental_bill_meter_intervals_bill_scope_fk" FOREIGN KEY ("organization_id","contract_id","bill_id") REFERENCES "rental_bills"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_bill_meter_intervals" ADD CONSTRAINT "rental_bill_meter_intervals_line_scope_kind_fk" FOREIGN KEY ("organization_id","contract_id","bill_id","bill_line_id","kind") REFERENCES "rental_bill_lines"("organization_id","contract_id","bill_id","id","kind");--> statement-breakpoint
ALTER TABLE "rental_bill_meter_intervals" ADD CONSTRAINT "rental_bill_meter_intervals_start_reading_scope_kind_fk" FOREIGN KEY ("organization_id","contract_id","space_id","kind","start_reading_id") REFERENCES "rental_meter_readings"("organization_id","contract_id","space_id","kind","id");--> statement-breakpoint
ALTER TABLE "rental_bill_meter_intervals" ADD CONSTRAINT "rental_bill_meter_intervals_end_predecessor_scope_fk" FOREIGN KEY ("organization_id","contract_id","space_id","kind","end_reading_id","start_reading_id") REFERENCES "rental_meter_readings"("organization_id","contract_id","space_id","kind","id","predecessor_id");--> statement-breakpoint
ALTER TABLE "rental_charge_term_revisions" ADD CONSTRAINT "rental_charge_term_revisions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_charge_term_revisions" ADD CONSTRAINT "rental_charge_term_revisions_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_charge_terms" ADD CONSTRAINT "rental_charge_terms_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_charge_terms" ADD CONSTRAINT "rental_charge_terms_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_meter_reading_revisions" ADD CONSTRAINT "rental_meter_reading_revisions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_meter_reading_revisions" ADD CONSTRAINT "rental_meter_reading_revisions_reading_scope_fk" FOREIGN KEY ("organization_id","contract_id","reading_id") REFERENCES "rental_meter_readings"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_contract_space_scope_fk" FOREIGN KEY ("organization_id","contract_id","space_id") REFERENCES "rental_contract_spaces"("organization_id","contract_id","space_id");--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_predecessor_scope_kind_fk" FOREIGN KEY ("organization_id","contract_id","space_id","kind","predecessor_id") REFERENCES "rental_meter_readings"("organization_id","contract_id","space_id","kind","id");--> statement-breakpoint
ALTER TABLE "rental_settlement_bills" ADD CONSTRAINT "rental_settlement_bills_settlement_scope_fk" FOREIGN KEY ("organization_id","contract_id","settlement_id") REFERENCES "rental_settlements"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_settlement_bills" ADD CONSTRAINT "rental_settlement_bills_bill_scope_fk" FOREIGN KEY ("organization_id","contract_id","bill_id") REFERENCES "rental_bills"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_settlement_revisions" ADD CONSTRAINT "rental_settlement_revisions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_settlement_revisions" ADD CONSTRAINT "rental_settlement_revisions_settlement_scope_fk" FOREIGN KEY ("organization_id","contract_id","settlement_id") REFERENCES "rental_settlements"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_settlements" ADD CONSTRAINT "rental_settlements_confirmed_by_user_id_users_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_settlements" ADD CONSTRAINT "rental_settlements_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_model_version_check" CHECK ("model_version" IN (1, 2) AND "revision" >= 1);--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_billing_month_check" CHECK (("type"::text = 'monthly' AND "model_version" = 2 AND "billing_month" IS NOT NULL AND "billing_month" ~ '^\d{4}-(0[1-9]|1[0-2])$') OR ("type"::text <> 'monthly' AND "billing_month" IS NULL));--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_billing_mode_check" CHECK ("billing_mode" IN ('legacy_receivable', 'monthly_settlement'));--> statement-breakpoint
ALTER TABLE "rental_bill_lines" DROP CONSTRAINT "rental_bill_lines_money_check", ADD CONSTRAINT "rental_bill_lines_money_check" CHECK ("amount_minor" BETWEEN -9007199254740991 AND 9007199254740991 AND ("kind"::text IN ('termination_adjustment', 'extra_fee') OR "amount_minor" >= 0));--> statement-breakpoint
ALTER TABLE "rental_bills" DROP CONSTRAINT "rental_bills_period_check", ADD CONSTRAINT "rental_bills_period_check" CHECK (("type"::text = 'deposit' AND "period_start" IS NULL AND "period_end" IS NULL AND "effective_end" IS NULL) OR ("type"::text = 'rent' AND "model_version" = 1 AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL AND "effective_end" IS NOT NULL AND "effective_end" BETWEEN "period_start" AND "period_end") OR ("type"::text = 'monthly' AND "model_version" = 2 AND "period_start" IS NULL AND "period_end" IS NULL AND "effective_end" IS NULL AND "billing_month" IS NOT NULL));