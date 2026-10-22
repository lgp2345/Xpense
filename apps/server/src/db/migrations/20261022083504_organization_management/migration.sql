DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE name = '' OR name <> btrim(name, E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279))) THEN
    RAISE EXCEPTION '组织名称未规范，请先人工处理后再迁移';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations GROUP BY name HAVING count(*) > 1) THEN
    RAISE EXCEPTION '组织名称重复，请先人工处理后再迁移';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "initial_password_unchanged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "initial_password_unchanged" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_name_unique" ON "organizations" ("name");
