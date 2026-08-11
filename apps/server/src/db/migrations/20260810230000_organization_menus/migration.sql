-- Drizzle PostgreSQL migrator owns the outer transaction for this migration.
-- Do not add BEGIN or COMMIT here: any exception below must roll back the whole migration.

CREATE TYPE "menu_type" AS ENUM('directory', 'menu', 'button');

INSERT INTO "permissions" ("key", "name", "resource", "action", "description")
VALUES
  ('dashboard:read', 'dashboard:read', 'dashboard', 'read', 'dashboard:read'),
  ('menus:read', 'menus:read', 'menus', 'read', 'menus:read'),
  ('menus:create', 'menus:create', 'menus', 'create', 'menus:create'),
  ('menus:update', 'menus:update', 'menus', 'update', 'menus:update'),
  ('menus:delete', 'menus:delete', 'menus', 'delete', 'menus:delete')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."key" = 'dashboard:read'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."key" IN ('owner', 'admin')
  AND "permissions"."key" IN ('menus:read', 'menus:create', 'menus:update', 'menus:delete')
ON CONFLICT DO NOTHING;

CREATE TABLE "menus_next" (
  "id" integer GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "menus_id_seq") PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "type" "menu_type" NOT NULL,
  "name" text NOT NULL,
  "parent_id" integer,
  "route_key" text,
  "path" text,
  "icon" text,
  "permission_code" text,
  "is_external" boolean,
  "is_visible" boolean,
  "keep_alive" boolean,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TEMP TABLE "menu_id_map" (
  "organization_id" uuid NOT NULL,
  "old_menu_id" uuid NOT NULL,
  "new_menu_id" integer NOT NULL,
  PRIMARY KEY ("organization_id", "old_menu_id")
) ON COMMIT DROP;

DO $$
DECLARE
  legacy_menu_count bigint;
  organization_count bigint;
  invalid_menu record;
BEGIN
  SELECT COUNT(*) INTO legacy_menu_count FROM "menus";
  SELECT COUNT(*) INTO organization_count FROM "organizations";

  IF legacy_menu_count > 0 AND organization_count = 0 THEN
    RAISE EXCEPTION 'Cannot migrate legacy menus without organizations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "menus" AS "child"
    LEFT JOIN "menus" AS "parent" ON "parent"."id" = "child"."parent_id"
    WHERE "child"."parent_id" IS NOT NULL
      AND "parent"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate legacy menu tree: orphan parent';
  END IF;

  IF EXISTS (
    WITH RECURSIVE "ancestor_walk" AS (
      SELECT "id", "parent_id", ARRAY["id"] AS "visited_ids", FALSE AS "has_cycle"
      FROM "menus"

      UNION ALL

      SELECT
        "parent"."id",
        "parent"."parent_id",
        "ancestor_walk"."visited_ids" || "parent"."id",
        "parent"."id" = ANY("ancestor_walk"."visited_ids")
      FROM "ancestor_walk"
      JOIN "menus" AS "parent" ON "parent"."id" = "ancestor_walk"."parent_id"
      WHERE NOT "ancestor_walk"."has_cycle"
    )
    SELECT 1
    FROM "ancestor_walk"
    WHERE "has_cycle"
  ) THEN
    RAISE EXCEPTION 'Cannot migrate legacy menu tree: cycle detected';
  END IF;

  IF EXISTS (
    WITH RECURSIVE "reachable_tree" AS (
      SELECT "id"
      FROM "menus"
      WHERE "parent_id" IS NULL

      UNION ALL

      SELECT "child"."id"
      FROM "menus" AS "child"
      JOIN "reachable_tree" ON "child"."parent_id" = "reachable_tree"."id"
    )
    SELECT 1
    FROM "menus"
    LEFT JOIN "reachable_tree" USING ("id")
    WHERE "reachable_tree"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate legacy menu tree: unreachable node';
  END IF;

  SELECT "component_key", "path"
  INTO invalid_menu
  FROM "menus"
  WHERE NOT (
    ("component_key" IS NULL AND "path" = '')
    OR ("component_key" IS NULL AND "path" ~ '^https?://')
    OR ("component_key" = 'DashboardPage' AND "path" = '/')
    OR ("component_key" = 'MembersPage' AND "path" = '/members')
    OR ("component_key" = 'RolesPage' AND "path" = '/roles')
    OR ("component_key" = 'SessionsPage' AND "path" = '/sessions')
    OR ("component_key" = 'AuditLogsPage' AND "path" = '/audit-logs')
  )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot migrate internal menu % (%): no route mapping',
      invalid_menu."component_key", invalid_menu."path";
  END IF;
END $$;

DO $$
DECLARE
  organization_row record;
  source_menu record;
  button_row record;
  route_key text;
  mapped_parent_id integer;
  inserted_menu_id integer;
  source_menu_count bigint;
  organization_count bigint;
  copied_menu_count bigint;
  template_menu_count bigint := 0;
  button_count bigint := 0;
  menu_management_button_count bigint := 0;
  migrated_menu_count bigint;
  menu_management_parent_id integer;
BEGIN
  FOR organization_row IN SELECT "id" FROM "organizations" LOOP
    FOR source_menu IN
      WITH RECURSIVE "source_tree" AS (
        SELECT
          "id",
          "name",
          "path",
          "parent_id",
          "component_key",
          "icon",
          "permission_code",
          "sort_order",
          "created_at",
          "updated_at",
          0 AS "depth"
        FROM "menus"
        WHERE "parent_id" IS NULL

        UNION ALL

        SELECT
          "child"."id",
          "child"."name",
          "child"."path",
          "child"."parent_id",
          "child"."component_key",
          "child"."icon",
          "child"."permission_code",
          "child"."sort_order",
          "child"."created_at",
          "child"."updated_at",
          "source_tree"."depth" + 1
        FROM "menus" AS "child"
        JOIN "source_tree" ON "child"."parent_id" = "source_tree"."id"
      )
      SELECT *
      FROM "source_tree"
      ORDER BY "depth", "sort_order", "id"
    LOOP
      mapped_parent_id := NULL;
      route_key := NULL;

      IF source_menu."parent_id" IS NOT NULL THEN
        SELECT "new_menu_id"
        INTO mapped_parent_id
        FROM "menu_id_map"
        WHERE "organization_id" = organization_row."id"
          AND "old_menu_id" = source_menu."parent_id";

        IF mapped_parent_id IS NULL THEN
          RAISE EXCEPTION 'Cannot migrate menu %: parent % was not copied first',
            source_menu."id", source_menu."parent_id";
        END IF;
      END IF;

      IF source_menu."component_key" IS NULL AND source_menu."path" = '' THEN
        INSERT INTO "menus_next" (
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
          "sort_order",
          "created_at",
          "updated_at"
        ) VALUES (
          organization_row."id",
          'directory',
          source_menu."name",
          mapped_parent_id,
          NULL,
          NULL,
          source_menu."icon",
          NULL,
          NULL,
          TRUE,
          NULL,
          source_menu."sort_order",
          source_menu."created_at",
          source_menu."updated_at"
        )
        RETURNING "id" INTO inserted_menu_id;
      ELSIF source_menu."component_key" IS NULL AND source_menu."path" ~ '^https?://' THEN
        IF source_menu."permission_code" IS NULL THEN
          RAISE EXCEPTION 'Cannot migrate external menu %: permission code is required', source_menu."id";
        END IF;

        INSERT INTO "menus_next" (
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
          "sort_order",
          "created_at",
          "updated_at"
        ) VALUES (
          organization_row."id",
          'menu',
          source_menu."name",
          mapped_parent_id,
          NULL,
          source_menu."path",
          source_menu."icon",
          source_menu."permission_code",
          TRUE,
          TRUE,
          NULL,
          source_menu."sort_order",
          source_menu."created_at",
          source_menu."updated_at"
        )
        RETURNING "id" INTO inserted_menu_id;
      ELSE
        route_key := CASE
          WHEN source_menu."component_key" = 'DashboardPage' AND source_menu."path" = '/' THEN 'Dashboard'
          WHEN source_menu."component_key" = 'MembersPage' AND source_menu."path" = '/members' THEN 'Members'
          WHEN source_menu."component_key" = 'RolesPage' AND source_menu."path" = '/roles' THEN 'Roles'
          WHEN source_menu."component_key" = 'SessionsPage' AND source_menu."path" = '/sessions' THEN 'Sessions'
          WHEN source_menu."component_key" = 'AuditLogsPage' AND source_menu."path" = '/audit-logs' THEN 'AuditLogs'
          ELSE NULL
        END;

        IF route_key IS NULL THEN
          RAISE EXCEPTION 'Cannot migrate internal menu % (%): no route mapping',
            source_menu."component_key", source_menu."path";
        END IF;

        IF route_key <> 'Dashboard' AND source_menu."permission_code" IS NULL THEN
          RAISE EXCEPTION 'Cannot migrate internal menu %: permission code is required', source_menu."id";
        END IF;

        INSERT INTO "menus_next" (
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
          "sort_order",
          "created_at",
          "updated_at"
        ) VALUES (
          organization_row."id",
          'menu',
          source_menu."name",
          mapped_parent_id,
          route_key,
          NULL,
          source_menu."icon",
          CASE WHEN route_key = 'Dashboard' THEN 'dashboard:read' ELSE source_menu."permission_code" END,
          FALSE,
          TRUE,
          FALSE,
          source_menu."sort_order",
          source_menu."created_at",
          source_menu."updated_at"
        )
        RETURNING "id" INTO inserted_menu_id;
      END IF;

      INSERT INTO "menu_id_map" ("organization_id", "old_menu_id", "new_menu_id")
      VALUES (organization_row."id", source_menu."id", inserted_menu_id);
    END LOOP;

    SELECT "menu_id_map"."new_menu_id"
    INTO menu_management_parent_id
    FROM "menus" AS "access_control_directory"
    JOIN "menu_id_map"
      ON "menu_id_map"."organization_id" = organization_row."id"
      AND "menu_id_map"."old_menu_id" = "access_control_directory"."id"
    WHERE "access_control_directory"."component_key" IS NULL
      AND "access_control_directory"."path" = ''
      AND "access_control_directory"."name" = '访问控制'
    ORDER BY "access_control_directory"."sort_order", "access_control_directory"."id"
    LIMIT 1;

    -- A missing legacy access-control directory leaves menu management at the root.

    INSERT INTO "menus_next" (
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
    ) VALUES (
      organization_row."id",
      'menu',
      '菜单管理',
      menu_management_parent_id,
      'Menus',
      NULL,
      'ShieldCheck',
      'menus:read',
      FALSE,
      TRUE,
      FALSE,
      20
    );
    template_menu_count := template_menu_count + 1;

    IF menu_management_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM "menus_next"
      WHERE "organization_id" = organization_row."id"
        AND "id" = menu_management_parent_id
        AND "type" = 'directory'
    ) THEN
      RAISE EXCEPTION 'Menu migration management parent mismatch';
    END IF;

    FOR button_row IN
      SELECT *
      FROM (
        VALUES
          ('Members'::text, '新增成员'::text, 'members:create'::text, 100),
          ('Members'::text, '编辑成员'::text, 'members:update'::text, 110),
          ('Members'::text, '禁用成员'::text, 'members:disable'::text, 120),
          ('Members'::text, '启用成员'::text, 'members:enable'::text, 130),
          ('Roles'::text, '新增角色'::text, 'roles:create'::text, 100),
          ('Roles'::text, '编辑角色'::text, 'roles:update'::text, 110),
          ('Roles'::text, '删除角色'::text, 'roles:delete'::text, 120),
          ('Roles'::text, '编辑角色权限'::text, 'roles:permissions:update'::text, 130),
          ('Sessions'::text, '撤销会话'::text, 'sessions:revoke'::text, 100),
          ('Menus'::text, '新增菜单'::text, 'menus:create'::text, 100),
          ('Menus'::text, '编辑菜单'::text, 'menus:update'::text, 110),
          ('Menus'::text, '删除菜单'::text, 'menus:delete'::text, 120)
      ) AS "button_template"("parent_route_key", "name", "permission_code", "sort_order")
    LOOP
      SELECT "id"
      INTO mapped_parent_id
      FROM "menus_next"
      WHERE "organization_id" = organization_row."id"
        AND "route_key" = button_row."parent_route_key";

      IF mapped_parent_id IS NOT NULL THEN
        INSERT INTO "menus_next" (
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
        ) VALUES (
          organization_row."id",
          'button',
          button_row."name",
          mapped_parent_id,
          NULL,
          NULL,
          NULL,
          button_row."permission_code",
          NULL,
          NULL,
          NULL,
          button_row."sort_order"
        );
        button_count := button_count + 1;

        IF button_row."parent_route_key" = 'Menus' THEN
          menu_management_button_count := menu_management_button_count + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  SELECT COUNT(*) INTO source_menu_count FROM "menus";
  SELECT COUNT(*) INTO organization_count FROM "organizations";
  SELECT COUNT(*) INTO copied_menu_count FROM "menu_id_map";

  IF copied_menu_count <> source_menu_count * organization_count THEN
    RAISE EXCEPTION 'Menu migration count mismatch';
  END IF;

  SELECT COUNT(*) INTO migrated_menu_count FROM "menus_next";
  IF migrated_menu_count <> copied_menu_count + template_menu_count + button_count THEN
    RAISE EXCEPTION 'Menu migration count mismatch';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "menus_next"
    WHERE "type" = 'menu'
      AND "route_key" = 'Menus'
      AND "permission_code" = 'menus:read'
      AND "is_external" IS FALSE
  ) <> organization_count THEN
    RAISE EXCEPTION 'Menu migration management menu count mismatch';
  END IF;

  IF menu_management_button_count <> organization_count * 3 THEN
    RAISE EXCEPTION 'Menu migration management button count mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "menus_next" AS "menu_management_button"
    LEFT JOIN "menus_next" AS "menu_management"
      ON "menu_management"."organization_id" = "menu_management_button"."organization_id"
      AND "menu_management"."id" = "menu_management_button"."parent_id"
    WHERE "menu_management_button"."type" = 'button'
      AND "menu_management_button"."permission_code" IN (
        'menus:create',
        'menus:update',
        'menus:delete'
      )
      AND (
        "menu_management"."id" IS NULL
        OR "menu_management"."type" <> 'menu'
        OR "menu_management"."route_key" <> 'Menus'
      )
  ) THEN
    RAISE EXCEPTION 'Menu migration management button parent mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "menus_next" AS "child"
    LEFT JOIN "menus_next" AS "parent"
      ON "parent"."organization_id" = "child"."organization_id"
      AND "parent"."id" = "child"."parent_id"
    WHERE "child"."parent_id" IS NOT NULL
      AND "parent"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Menu migration parent ownership mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "menus_next"
    WHERE "type" = 'menu'
      AND "is_external" IS FALSE
      AND "route_key" IS NULL
  ) THEN
    RAISE EXCEPTION 'Menu migration route mapping mismatch';
  END IF;
END $$;

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_organization_id_unique" UNIQUE ("organization_id", "id");

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_organization_id_organizations_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_permission_code_permissions_key_fkey"
  FOREIGN KEY ("permission_code") REFERENCES "permissions"("key");

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_organization_parent_fk"
  FOREIGN KEY ("organization_id", "parent_id")
  REFERENCES "menus_next"("organization_id", "id");

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_directory_fields_check" CHECK (
    "type" <> 'directory' OR (
      "route_key" IS NULL
      AND "path" IS NULL
      AND "permission_code" IS NULL
      AND "is_external" IS NULL
      AND "keep_alive" IS NULL
      AND "is_visible" IS NOT NULL
    )
  );

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_internal_menu_fields_check" CHECK (
    "type" <> 'menu' OR "is_external" IS TRUE OR (
      "is_external" IS FALSE
      AND "route_key" IS NOT NULL
      AND "path" IS NULL
      AND "permission_code" IS NOT NULL
      AND "is_visible" IS NOT NULL
      AND "keep_alive" IS NOT NULL
    )
  );

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_external_menu_fields_check" CHECK (
    "type" <> 'menu' OR "is_external" IS FALSE OR (
      "is_external" IS TRUE
      AND "route_key" IS NULL
      AND "path" IS NOT NULL
      AND "permission_code" IS NOT NULL
      AND "is_visible" IS NOT NULL
      AND "keep_alive" IS NULL
    )
  );

ALTER TABLE "menus_next"
  ADD CONSTRAINT "menus_button_fields_check" CHECK (
    "type" <> 'button' OR (
      "parent_id" IS NOT NULL
      AND "route_key" IS NULL
      AND "path" IS NULL
      AND "icon" IS NULL
      AND "permission_code" IS NOT NULL
      AND "is_external" IS NULL
      AND "is_visible" IS NULL
      AND "keep_alive" IS NULL
    )
  );

CREATE UNIQUE INDEX "menus_organization_route_key_unique"
  ON "menus_next" ("organization_id", "route_key")
  WHERE "route_key" IS NOT NULL;

CREATE UNIQUE INDEX "menus_organization_path_unique"
  ON "menus_next" ("organization_id", "path")
  WHERE "path" IS NOT NULL;

CREATE INDEX "menus_organization_idx" ON "menus_next" ("organization_id");
CREATE INDEX "menus_organization_parent_idx" ON "menus_next" ("organization_id", "parent_id");
CREATE INDEX "menus_organization_parent_sort_idx"
  ON "menus_next" ("organization_id", "parent_id", "sort_order");

DROP TABLE "menus";
ALTER TABLE "menus_next" RENAME TO "menus";
