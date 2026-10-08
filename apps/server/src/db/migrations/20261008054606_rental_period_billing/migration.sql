CREATE TABLE "rental_billing_starts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"first_period_start" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_billing_starts_contract_unique" UNIQUE("organization_id","contract_id"),
	CONSTRAINT "rental_billing_starts_scope_unique" UNIQUE("organization_id","contract_id","id"),
	CONSTRAINT "rental_billing_starts_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "rental_meter_readings" DROP CONSTRAINT "rental_meter_readings_date_unique";--> statement-breakpoint
ALTER TABLE "rental_bills" DROP CONSTRAINT "rental_bills_model_version_check";--> statement-breakpoint
ALTER TABLE "rental_bills" DROP CONSTRAINT "rental_bills_billing_month_check";--> statement-breakpoint
ALTER TABLE "rental_contracts" DROP CONSTRAINT "rental_contracts_billing_mode_check";--> statement-breakpoint
DROP INDEX "rental_bills_monthly_current_unique";--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD COLUMN "source" text DEFAULT 'contract' NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD COLUMN "billing_start_id" uuid;--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD COLUMN "settlement_id" uuid;--> statement-breakpoint
ALTER TABLE "rental_bills" DROP CONSTRAINT "rental_bills_period_check";--> statement-breakpoint
ALTER TABLE "rental_bills" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "rental_bill_type";--> statement-breakpoint
CREATE TYPE "rental_bill_type" AS ENUM('period', 'deposit');--> statement-breakpoint
ALTER TABLE "rental_bills" ALTER COLUMN "type" SET DATA TYPE "rental_bill_type" USING "type"::"rental_bill_type";--> statement-breakpoint
ALTER TABLE "rental_bills" DROP COLUMN "model_version";--> statement-breakpoint
ALTER TABLE "rental_bills" DROP COLUMN "billing_month";--> statement-breakpoint
ALTER TABLE "rental_contracts" DROP COLUMN "billing_mode";--> statement-breakpoint
DROP INDEX "rental_meter_readings_baseline_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "rental_meter_readings_baseline_unique" ON "rental_meter_readings" ("organization_id","contract_id","space_id","kind") WHERE "source" = 'contract';--> statement-breakpoint
CREATE UNIQUE INDEX "rental_bills_period_current_unique" ON "rental_bills" ("organization_id","contract_id","period_start") WHERE "status" = 'active' AND "type" = 'period';--> statement-breakpoint
CREATE UNIQUE INDEX "rental_meter_readings_start_unique" ON "rental_meter_readings" ("organization_id","contract_id","billing_start_id","kind") WHERE "source" = 'billing_start';--> statement-breakpoint
CREATE UNIQUE INDEX "rental_meter_readings_bill_unique" ON "rental_meter_readings" ("organization_id","contract_id","bill_id","kind") WHERE "source" = 'bill';--> statement-breakpoint
CREATE UNIQUE INDEX "rental_meter_readings_settlement_unique" ON "rental_meter_readings" ("organization_id","contract_id","settlement_id","kind") WHERE "source" = 'settlement';--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_start_scope_fk" FOREIGN KEY ("organization_id","contract_id","billing_start_id") REFERENCES "rental_billing_starts"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_bill_scope_fk" FOREIGN KEY ("organization_id","contract_id","bill_id") REFERENCES "rental_bills"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_settlement_scope_fk" FOREIGN KEY ("organization_id","contract_id","settlement_id") REFERENCES "rental_settlements"("organization_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "rental_billing_starts" ADD CONSTRAINT "rental_billing_starts_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_billing_starts" ADD CONSTRAINT "rental_billing_starts_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_revision_check" CHECK ("revision" >= 1);--> statement-breakpoint
ALTER TABLE "rental_meter_readings" ADD CONSTRAINT "rental_meter_readings_source_check" CHECK (("source" = 'contract' AND "predecessor_id" IS NULL AND "billing_start_id" IS NULL AND "bill_id" IS NULL AND "settlement_id" IS NULL) OR ("source" = 'billing_start' AND "predecessor_id" IS NULL AND "billing_start_id" IS NOT NULL AND "bill_id" IS NULL AND "settlement_id" IS NULL) OR ("source" = 'bill' AND "predecessor_id" IS NOT NULL AND "billing_start_id" IS NULL AND "bill_id" IS NOT NULL AND "settlement_id" IS NULL) OR ("source" = 'settlement' AND "predecessor_id" IS NOT NULL AND "billing_start_id" IS NULL AND "bill_id" IS NULL AND "settlement_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_period_check" CHECK (("type"::text = 'deposit' AND "period_start" IS NULL AND "period_end" IS NULL AND "effective_end" IS NULL) OR ("type"::text = 'period' AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL AND "period_end" >= "period_start" AND "effective_end" BETWEEN "period_start" AND "period_end"));