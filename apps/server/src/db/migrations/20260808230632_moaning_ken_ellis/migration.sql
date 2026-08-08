CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"path" text NOT NULL,
	"parent_id" uuid,
	"component_key" text,
	"icon" text,
	"permission_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "menus_parent_idx" ON "menus" ("parent_id");--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_parent_id_menus_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menus"("id");