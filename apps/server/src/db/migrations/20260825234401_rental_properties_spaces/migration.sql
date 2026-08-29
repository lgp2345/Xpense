CREATE TYPE "rental_property_type" AS ENUM('residential_unit', 'detached_house', 'apartment_building', 'commercial_building', 'complex', 'shop', 'office', 'warehouse', 'other');--> statement-breakpoint
CREATE TYPE "rental_space_type" AS ENUM('building', 'floor', 'unit', 'room', 'shop', 'office', 'parking_space', 'warehouse', 'other');--> statement-breakpoint
CREATE TABLE "rental_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "rental_property_type" NOT NULL,
	"custom_type_name" text,
	"country_code" text NOT NULL,
	"province" text,
	"city" text,
	"district" text,
	"address_line" text NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_properties_organization_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "rental_properties_organization_ledger_unique" UNIQUE("organization_id","ledger_id"),
	CONSTRAINT "rental_properties_custom_type_name_check" CHECK (("type" = 'other' AND "custom_type_name" IS NOT NULL) OR ("type" <> 'other' AND "custom_type_name" IS NULL)),
	CONSTRAINT "rental_properties_country_code_check" CHECK (char_length("country_code") = 2)
);
--> statement-breakpoint
CREATE TABLE "rental_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"type" "rental_space_type" NOT NULL,
	"custom_type_name" text,
	"is_rentable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_spaces_organization_property_id_unique" UNIQUE("organization_id","property_id","id"),
	CONSTRAINT "rental_spaces_custom_type_name_check" CHECK (("type" = 'other' AND "custom_type_name" IS NOT NULL) OR ("type" <> 'other' AND "custom_type_name" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rental_properties_active_name_unique" ON "rental_properties" ("organization_id","name") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "rental_properties_organization_deleted_idx" ON "rental_properties" ("organization_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_spaces_active_root_name_unique" ON "rental_spaces" ("organization_id","property_id","name") WHERE "parent_id" IS NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_spaces_active_child_name_unique" ON "rental_spaces" ("organization_id","property_id","parent_id","name") WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_spaces_active_root_code_unique" ON "rental_spaces" ("organization_id","property_id","code") WHERE "parent_id" IS NULL AND "code" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_spaces_active_child_code_unique" ON "rental_spaces" ("organization_id","property_id","parent_id","code") WHERE "parent_id" IS NOT NULL AND "code" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "rental_spaces_scope_parent_deleted_sort_idx" ON "rental_spaces" ("organization_id","property_id","parent_id","deleted_at","sort_order");--> statement-breakpoint
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_organization_ledger_fk" FOREIGN KEY ("organization_id","ledger_id") REFERENCES "ledgers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_spaces" ADD CONSTRAINT "rental_spaces_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "rental_spaces" ADD CONSTRAINT "rental_spaces_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_spaces" ADD CONSTRAINT "rental_spaces_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_spaces" ADD CONSTRAINT "rental_spaces_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_spaces" ADD CONSTRAINT "rental_spaces_organization_property_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "rental_properties"("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_spaces" ADD CONSTRAINT "rental_spaces_parent_scope_fk" FOREIGN KEY ("organization_id","property_id","parent_id") REFERENCES "rental_spaces"("organization_id","property_id","id");--> statement-breakpoint

INSERT INTO "permissions" ("key", "name", "resource", "action", "description")
VALUES
  ('rental_properties:read', 'rental_properties:read', 'rental_properties', 'read', 'rental_properties:read'),
  ('rental_properties:create', 'rental_properties:create', 'rental_properties', 'create', 'rental_properties:create'),
  ('rental_properties:update', 'rental_properties:update', 'rental_properties', 'update', 'rental_properties:update'),
  ('rental_properties:delete', 'rental_properties:delete', 'rental_properties', 'delete', 'rental_properties:delete'),
  ('rental_spaces:read', 'rental_spaces:read', 'rental_spaces', 'read', 'rental_spaces:read'),
  ('rental_spaces:create', 'rental_spaces:create', 'rental_spaces', 'create', 'rental_spaces:create'),
  ('rental_spaces:update', 'rental_spaces:update', 'rental_spaces', 'update', 'rental_spaces:update'),
  ('rental_spaces:delete', 'rental_spaces:delete', 'rental_spaces', 'delete', 'rental_spaces:delete')
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
      'rental_properties:read',
      'rental_properties:create',
      'rental_properties:update',
      'rental_properties:delete',
      'rental_spaces:read',
      'rental_spaces:create',
      'rental_spaces:update',
      'rental_spaces:delete'
    ))
  OR ("roles"."key" IN ('member', 'viewer')
    AND "permissions"."key" IN ('rental_properties:read', 'rental_spaces:read'))
)
WHERE "roles"."is_system" IS TRUE
  AND "roles"."organization_id" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

DO $$
DECLARE
  organization_row record;
  rental_directory_id integer;
  rental_properties_menu_id integer;
  rental_menu_id integer;
  button_row record;
BEGIN
  FOR organization_row IN SELECT "id" FROM "organizations" LOOP
    rental_directory_id := NULL;

    SELECT "id"
    INTO rental_directory_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id"
      AND "type" = 'directory'
      AND "parent_id" IS NULL
      AND "name" = '租赁管理'
    ORDER BY "id"
    LIMIT 1;

    IF rental_directory_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id",
        "type",
        "name",
        "parent_id",
        "route_key",
        "path",
        "icon",
        "permission_code",
        "is_external",
        "is_visible",
        "keep_alive",
        "sort_order"
      )
      VALUES (
        organization_row."id",
        'directory',
        '租赁管理',
        NULL,
        NULL,
        NULL,
        'Building2',
        NULL,
        NULL,
        TRUE,
        NULL,
        8
      )
      RETURNING "id" INTO rental_directory_id;
    END IF;

    rental_properties_menu_id := NULL;
    SELECT "id"
    INTO rental_properties_menu_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id"
      AND "route_key" = 'RentalProperties'
    LIMIT 1;

    IF rental_properties_menu_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id",
        "type",
        "name",
        "parent_id",
        "route_key",
        "path",
        "icon",
        "permission_code",
        "is_external",
        "is_visible",
        "keep_alive",
        "sort_order"
      )
      VALUES (
        organization_row."id",
        'menu',
        '房产管理',
        rental_directory_id,
        'RentalProperties',
        NULL,
        'Building2',
        'rental_properties:read',
        FALSE,
        TRUE,
        TRUE,
        0
      )
      RETURNING "id" INTO rental_properties_menu_id;
    END IF;

    IF rental_properties_menu_id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve rental properties menu for organization %',
        organization_row."id";
    END IF;

    SELECT "id"
    INTO rental_menu_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id"
      AND "route_key" = 'RentalPropertyDetail'
    LIMIT 1;

    IF rental_menu_id IS NULL THEN
      INSERT INTO "menus" (
        "organization_id",
        "type",
        "name",
        "parent_id",
        "route_key",
        "path",
        "icon",
        "permission_code",
        "is_external",
        "is_visible",
        "keep_alive",
        "sort_order"
      )
      VALUES (
        organization_row."id",
        'menu',
        '房产详情',
        rental_properties_menu_id,
        'RentalPropertyDetail',
        NULL,
        NULL,
        'rental_properties:read',
        FALSE,
        FALSE,
        FALSE,
        0
      );
    END IF;

    FOR button_row IN
      SELECT *
      FROM (VALUES
        ('新增房产', 'rental_properties:create', 100),
        ('编辑房产', 'rental_properties:update', 110),
        ('删除房产', 'rental_properties:delete', 120),
        ('新增空间', 'rental_spaces:create', 130),
        ('编辑空间', 'rental_spaces:update', 140),
        ('删除空间', 'rental_spaces:delete', 150)
      ) AS rental_buttons(button_name, permission_key, button_sort_order)
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM "menus"
        WHERE "organization_id" = organization_row."id"
          AND "type" = 'button'
          AND "parent_id" = rental_properties_menu_id
          AND "permission_code" = button_row.permission_key
      ) THEN
        INSERT INTO "menus" (
          "organization_id",
          "type",
          "name",
          "parent_id",
          "route_key",
          "path",
          "icon",
          "permission_code",
          "is_external",
          "is_visible",
          "keep_alive",
          "sort_order"
        )
        VALUES (
          organization_row."id",
          'button',
          button_row.button_name,
          rental_properties_menu_id,
          NULL,
          NULL,
          NULL,
          button_row.permission_key,
          NULL,
          NULL,
          NULL,
          button_row.button_sort_order
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;--> statement-breakpoint

COMMENT ON TYPE "rental_property_type" IS '租赁房产类型，涵盖住宅、商业及其他房产';
COMMENT ON TYPE "rental_space_type" IS '租赁空间类型，描述房产内部可分组或可出租的空间类型';

COMMENT ON TABLE "rental_properties" IS '租赁房产档案';
COMMENT ON COLUMN "rental_properties"."id" IS '租赁房产主键 UUID';
COMMENT ON COLUMN "rental_properties"."organization_id" IS '房产所属组织 ID';
COMMENT ON COLUMN "rental_properties"."ledger_id" IS '房产绑定的组织内租赁账本 ID，每个账本仅能绑定一处房产';
COMMENT ON COLUMN "rental_properties"."name" IS '房产显示名称';
COMMENT ON COLUMN "rental_properties"."type" IS '房产类型';
COMMENT ON COLUMN "rental_properties"."custom_type_name" IS '当房产类型为 other 时必填的自定义类型名称';
COMMENT ON COLUMN "rental_properties"."country_code" IS 'ISO 3166-1 alpha-2 两位国家代码';
COMMENT ON COLUMN "rental_properties"."province" IS '房产所在省、州或一级行政区';
COMMENT ON COLUMN "rental_properties"."city" IS '房产所在城市';
COMMENT ON COLUMN "rental_properties"."district" IS '房产所在区、县或次级行政区';
COMMENT ON COLUMN "rental_properties"."address_line" IS '房产详细地址';
COMMENT ON COLUMN "rental_properties"."note" IS '房产备注，可能包含业务描述';
COMMENT ON COLUMN "rental_properties"."is_active" IS '是否可用于当前租赁业务，停用后保留历史关联';
COMMENT ON COLUMN "rental_properties"."created_by_user_id" IS '创建房产的用户 ID';
COMMENT ON COLUMN "rental_properties"."updated_by_user_id" IS '最后更新房产的用户 ID';
COMMENT ON COLUMN "rental_properties"."deleted_at" IS '房产软删除时间，为空表示未删除';
COMMENT ON COLUMN "rental_properties"."deleted_by_user_id" IS '执行房产软删除的用户 ID';
COMMENT ON COLUMN "rental_properties"."created_at" IS '房产创建时间，使用带时区时间戳';
COMMENT ON COLUMN "rental_properties"."updated_at" IS '房产最后更新时间，使用带时区时间戳';

COMMENT ON TABLE "rental_spaces" IS '租赁房产下的空间树';
COMMENT ON COLUMN "rental_spaces"."id" IS '租赁空间主键 UUID';
COMMENT ON COLUMN "rental_spaces"."organization_id" IS '空间所属组织 ID';
COMMENT ON COLUMN "rental_spaces"."property_id" IS '空间所属房产 ID';
COMMENT ON COLUMN "rental_spaces"."parent_id" IS '父空间 ID，为空表示该房产的根空间';
COMMENT ON COLUMN "rental_spaces"."name" IS '空间显示名称';
COMMENT ON COLUMN "rental_spaces"."code" IS '同父空间内可选且唯一的业务编码';
COMMENT ON COLUMN "rental_spaces"."type" IS '空间类型';
COMMENT ON COLUMN "rental_spaces"."custom_type_name" IS '当空间类型为 other 时必填的自定义类型名称';
COMMENT ON COLUMN "rental_spaces"."is_rentable" IS '是否可出租；仅标记业务能力，未来合同可据此选择空间';
COMMENT ON COLUMN "rental_spaces"."is_active" IS '是否可用于当前租赁业务，停用后保留树位置和历史关联';
COMMENT ON COLUMN "rental_spaces"."sort_order" IS '同级空间的升序排序值';
COMMENT ON COLUMN "rental_spaces"."note" IS '空间备注，可能包含业务描述';
COMMENT ON COLUMN "rental_spaces"."created_by_user_id" IS '创建空间的用户 ID';
COMMENT ON COLUMN "rental_spaces"."updated_by_user_id" IS '最后更新空间的用户 ID';
COMMENT ON COLUMN "rental_spaces"."deleted_at" IS '空间软删除时间，为空表示未删除';
COMMENT ON COLUMN "rental_spaces"."deleted_by_user_id" IS '执行空间软删除的用户 ID';
COMMENT ON COLUMN "rental_spaces"."created_at" IS '空间创建时间，使用带时区时间戳';
COMMENT ON COLUMN "rental_spaces"."updated_at" IS '空间最后更新时间，使用带时区时间戳';
