DROP INDEX "rental_meter_readings_scope_date_idx";--> statement-breakpoint
ALTER TABLE "rental_meter_readings" DROP COLUMN "reading_date";--> statement-breakpoint
CREATE INDEX "rental_meter_readings_scope_kind_idx" ON "rental_meter_readings" ("organization_id","contract_id","kind");