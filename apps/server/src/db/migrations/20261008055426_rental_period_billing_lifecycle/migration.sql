ALTER TABLE "rental_billing_starts" DROP CONSTRAINT "rental_billing_starts_contract_unique";--> statement-breakpoint
ALTER TABLE "rental_billing_starts" ADD COLUMN "invalidated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_billing_starts_contract_current_unique" ON "rental_billing_starts" ("organization_id","contract_id") WHERE "invalidated_at" IS NULL;