CREATE TABLE "organization_membership_roles" (
	"membership_id" uuid,
	"role_id" uuid,
	CONSTRAINT "organization_membership_roles_pkey" PRIMARY KEY("membership_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "users" SET "username" = COALESCE(NULLIF(split_part("email", '@', 1), ''), NULLIF("phone", ''), '用户-' || left("id"::text, 8));--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "membership_roles_role_idx" ON "organization_membership_roles" ("role_id");--> statement-breakpoint
ALTER TABLE "organization_membership_roles" ADD CONSTRAINT "organization_membership_roles_NEKYGJaRnxIb_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id");--> statement-breakpoint
ALTER TABLE "organization_membership_roles" ADD CONSTRAINT "organization_membership_roles_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id");
