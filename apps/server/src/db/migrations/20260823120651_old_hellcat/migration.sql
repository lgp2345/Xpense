CREATE TYPE "account_type" AS ENUM('cash', 'bank', 'e_wallet', 'credit_card', 'other');--> statement-breakpoint
CREATE TYPE "category_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "ledger_type" AS ENUM('personal', 'rental');--> statement-breakpoint
CREATE TYPE "transaction_type" AS ENUM('income', 'expense', 'transfer', 'excluded_inflow', 'excluded_outflow');--> statement-breakpoint
CREATE TABLE "account_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_movements_amount_minor_nonzero_check" CHECK ("amount_minor" <> 0 AND "amount_minor" BETWEEN -9007199254740991 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_organization_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"type" "category_type" NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_organization_ledger_id_unique" UNIQUE("organization_id","ledger_id","id"),
	CONSTRAINT "categories_parent_scope_unique" UNIQUE("organization_id","ledger_id","type","id")
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "ledger_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledgers_organization_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"category_id" uuid,
	"amount_minor" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"occurred_on" date NOT NULL,
	"payee" text,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_organization_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "transaction_amount_minor_positive_check" CHECK ("amount_minor" > 0 AND "amount_minor" <= 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "base_currency" text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timezone" text DEFAULT 'Asia/Shanghai' NOT NULL;--> statement-breakpoint
CREATE INDEX "account_movements_organization_account_transaction_idx" ON "account_movements" ("organization_id","account_id","transaction_id");--> statement-breakpoint
CREATE INDEX "accounts_organization_deleted_sort_idx" ON "accounts" ("organization_id","deleted_at","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_active_root_name_unique" ON "categories" ("organization_id","ledger_id","type","name") WHERE "parent_id" IS NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_active_child_name_unique" ON "categories" ("organization_id","ledger_id","type","parent_id","name") WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "categories_scope_parent_deleted_idx" ON "categories" ("organization_id","ledger_id","type","parent_id","deleted_at");--> statement-breakpoint
CREATE INDEX "ledgers_organization_deleted_idx" ON "ledgers" ("organization_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_organization_active_default_unique" ON "ledgers" ("organization_id") WHERE "is_default" IS TRUE AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_organization_occurred_idx" ON "transactions" ("organization_id","occurred_on","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_organization_ledger_occurred_idx" ON "transactions" ("organization_id","ledger_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_organization_category_occurred_idx" ON "transactions" ("organization_id","category_id","occurred_on");--> statement-breakpoint
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_organization_transaction_fk" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "transactions"("organization_id","id");--> statement-breakpoint
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_organization_account_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "accounts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_ledger_fk" FOREIGN KEY ("organization_id","ledger_id") REFERENCES "ledgers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_scope_fk" FOREIGN KEY ("organization_id","ledger_id","type","parent_id") REFERENCES "categories"("organization_id","ledger_id","type","id");--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_deleted_by_user_id_users_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_ledger_fk" FOREIGN KEY ("organization_id","ledger_id") REFERENCES "ledgers"("organization_id","id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_scope_fk" FOREIGN KEY ("organization_id","ledger_id","category_id") REFERENCES "categories"("organization_id","ledger_id","id");--> statement-breakpoint

INSERT INTO "permissions" ("key", "name", "resource", "action", "description")
VALUES
  ('ledgers:read', 'ledgers:read', 'ledgers', 'read', 'ledgers:read'),
  ('accounts:read', 'accounts:read', 'accounts', 'read', 'accounts:read'),
  ('accounts:create', 'accounts:create', 'accounts', 'create', 'accounts:create'),
  ('accounts:update', 'accounts:update', 'accounts', 'update', 'accounts:update'),
  ('accounts:delete', 'accounts:delete', 'accounts', 'delete', 'accounts:delete'),
  ('categories:read', 'categories:read', 'categories', 'read', 'categories:read'),
  ('categories:create', 'categories:create', 'categories', 'create', 'categories:create'),
  ('categories:update', 'categories:update', 'categories', 'update', 'categories:update'),
  ('categories:delete', 'categories:delete', 'categories', 'delete', 'categories:delete'),
  ('transactions:read', 'transactions:read', 'transactions', 'read', 'transactions:read'),
  ('transactions:create', 'transactions:create', 'transactions', 'create', 'transactions:create'),
  ('transactions:update', 'transactions:update', 'transactions', 'update', 'transactions:update'),
  ('transactions:delete', 'transactions:delete', 'transactions', 'delete', 'transactions:delete'),
  ('statistics:read', 'statistics:read', 'statistics', 'read', 'statistics:read')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";--> statement-breakpoint

DO $$
DECLARE
  organization_row record;
  category_row record;
  default_ledger_id uuid;
  deterministic_ledger_id uuid;
  default_account_id uuid;
  default_category_id uuid;
BEGIN
  FOR organization_row IN
    SELECT "id", "created_by_user_id"
    FROM "organizations"
  LOOP
    default_ledger_id := NULL;

    SELECT "id"
    INTO default_ledger_id
    FROM "ledgers"
    WHERE "organization_id" = organization_row."id"
      AND "type" = 'personal'
      AND "is_default" IS TRUE
      AND "deleted_at" IS NULL
    ORDER BY "created_at", "id"
    LIMIT 1;

    IF default_ledger_id IS NULL THEN
      deterministic_ledger_id := md5(
        'xpense:bookkeeping-default:v1:organization:'
        || organization_row."id"::text
        || ':ledger:personal'
      )::uuid;

      INSERT INTO "ledgers" (
        "id",
        "organization_id",
        "name",
        "type",
        "is_default",
        "created_by_user_id"
      )
      VALUES (
        deterministic_ledger_id,
        organization_row."id",
        '个人账本',
        'personal',
        TRUE,
        organization_row."created_by_user_id"
      )
      ON CONFLICT DO NOTHING;

      SELECT "id"
      INTO default_ledger_id
      FROM "ledgers"
      WHERE "organization_id" = organization_row."id"
        AND "type" = 'personal'
        AND "is_default" IS TRUE
        AND "deleted_at" IS NULL
      ORDER BY "created_at", "id"
      LIMIT 1;
    END IF;

    IF default_ledger_id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve default personal ledger for organization %',
        organization_row."id";
    END IF;

    default_account_id := md5(
      'xpense:bookkeeping-default:v1:organization:'
      || organization_row."id"::text
      || ':account:cash'
    )::uuid;

    IF NOT EXISTS (
      SELECT 1
      FROM "accounts"
      WHERE "organization_id" = organization_row."id"
        AND ("id" = default_account_id OR "name" = '现金')
    ) THEN
      INSERT INTO "accounts" (
        "id",
        "organization_id",
        "name",
        "type",
        "sort_order",
        "created_by_user_id"
      )
      VALUES (
        default_account_id,
        organization_row."id",
        '现金',
        'cash',
        0,
        organization_row."created_by_user_id"
      )
      ON CONFLICT ("id") DO NOTHING;
    END IF;

    FOR category_row IN
      SELECT *
      FROM (VALUES
        ('expense', 'dining', '餐饮', 0),
        ('expense', 'transport', '交通', 1),
        ('expense', 'shopping', '购物', 2),
        ('expense', 'housing', '居住', 3),
        ('expense', 'entertainment', '娱乐', 4),
        ('expense', 'medical', '医疗', 5),
        ('expense', 'education', '教育', 6),
        ('expense', 'gifts', '人情', 7),
        ('expense', 'other', '其他', 8),
        ('income', 'salary', '工资', 0),
        ('income', 'bonus', '奖金', 1),
        ('income', 'freelance', '兼职', 2),
        ('income', 'investment', '理财', 3),
        ('income', 'other', '其他', 4)
      ) AS default_categories(
        category_type,
        category_key,
        category_name,
        category_sort_order
      )
    LOOP
      default_category_id := md5(
        'xpense:bookkeeping-default:v1:organization:'
        || organization_row."id"::text
        || ':ledger:'
        || default_ledger_id::text
        || ':category:'
        || category_row.category_type
        || ':'
        || category_row.category_key
      )::uuid;

      IF NOT EXISTS (
        SELECT 1
        FROM "categories"
        WHERE "organization_id" = organization_row."id"
          AND "ledger_id" = default_ledger_id
          AND "type" = category_row.category_type::"category_type"
          AND "parent_id" IS NULL
          AND ("id" = default_category_id OR "name" = category_row.category_name)
      ) THEN
        INSERT INTO "categories" (
          "id",
          "organization_id",
          "ledger_id",
          "type",
          "parent_id",
          "name",
          "sort_order",
          "created_by_user_id"
        )
        VALUES (
          default_category_id,
          organization_row."id",
          default_ledger_id,
          category_row.category_type::"category_type",
          NULL,
          category_row.category_name,
          category_row.category_sort_order,
          organization_row."created_by_user_id"
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;--> statement-breakpoint

DO $$
DECLARE
  organization_row record;
  menu_row record;
  button_row record;
  bookkeeping_directory_id integer;
  bookkeeping_menu_id integer;
BEGIN
  FOR organization_row IN SELECT "id" FROM "organizations" LOOP
    bookkeeping_directory_id := NULL;

    SELECT "id"
    INTO bookkeeping_directory_id
    FROM "menus"
    WHERE "organization_id" = organization_row."id"
      AND "type" = 'directory'
      AND "parent_id" IS NULL
      AND "name" = '记账管理'
    ORDER BY "id"
    LIMIT 1;

    IF bookkeeping_directory_id IS NULL THEN
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
        '记账管理',
        NULL,
        NULL,
        NULL,
        'ReceiptText',
        NULL,
        NULL,
        TRUE,
        NULL,
        5
      )
      RETURNING "id" INTO bookkeeping_directory_id;
    END IF;

    FOR menu_row IN
      SELECT *
      FROM (VALUES
        ('Transactions', '交易记录', 'ReceiptText', 'transactions:read', 0),
        ('Accounts', '账户管理', 'WalletCards', 'accounts:read', 10),
        ('Categories', '分类管理', 'Shapes', 'categories:read', 20)
      ) AS bookkeeping_menus(route_key, menu_name, icon_key, permission_key, menu_sort_order)
    LOOP
      bookkeeping_menu_id := NULL;

      SELECT "id"
      INTO bookkeeping_menu_id
      FROM "menus"
      WHERE "organization_id" = organization_row."id"
        AND "route_key" = menu_row.route_key
      LIMIT 1;

      IF bookkeeping_menu_id IS NULL THEN
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
          menu_row.menu_name,
          bookkeeping_directory_id,
          menu_row.route_key,
          NULL,
          menu_row.icon_key,
          menu_row.permission_key,
          FALSE,
          TRUE,
          TRUE,
          menu_row.menu_sort_order
        )
        ON CONFLICT DO NOTHING
        RETURNING "id" INTO bookkeeping_menu_id;

        IF bookkeeping_menu_id IS NULL THEN
          SELECT "id"
          INTO bookkeeping_menu_id
          FROM "menus"
          WHERE "organization_id" = organization_row."id"
            AND "route_key" = menu_row.route_key
          LIMIT 1;
        END IF;
      END IF;

      IF bookkeeping_menu_id IS NULL THEN
        RAISE EXCEPTION 'Failed to resolve bookkeeping menu % for organization %',
          menu_row.route_key,
          organization_row."id";
      END IF;

      FOR button_row IN
        SELECT *
        FROM (VALUES
          ('Transactions', '新增交易', 'transactions:create', 100),
          ('Transactions', '编辑交易', 'transactions:update', 110),
          ('Transactions', '删除交易', 'transactions:delete', 120),
          ('Accounts', '新增账户', 'accounts:create', 100),
          ('Accounts', '编辑账户', 'accounts:update', 110),
          ('Accounts', '删除账户', 'accounts:delete', 120),
          ('Categories', '新增分类', 'categories:create', 100),
          ('Categories', '编辑分类', 'categories:update', 110),
          ('Categories', '删除分类', 'categories:delete', 120)
        ) AS bookkeeping_buttons(parent_route_key, button_name, permission_key, button_sort_order)
        WHERE parent_route_key = menu_row.route_key
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM "menus"
          WHERE "organization_id" = organization_row."id"
            AND "type" = 'button'
            AND "parent_id" = bookkeeping_menu_id
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
            bookkeeping_menu_id,
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
  END LOOP;
END $$;--> statement-breakpoint

COMMENT ON TYPE "ledger_type" IS '账本类型：personal 为个人账本，rental 为未来租赁账本';
COMMENT ON TYPE "account_type" IS '账户类型：现金、银行、电子钱包、信用卡或其他';
COMMENT ON TYPE "category_type" IS '分类收支类型：income 为收入，expense 为支出';
COMMENT ON TYPE "transaction_type" IS '交易类型：收入、支出、转账及不计收支统计的排除型资金流';

COMMENT ON TABLE "ledgers" IS '组织内的业务账本，作为交易归属和统计边界';
COMMENT ON COLUMN "ledgers"."id" IS '账本主键 UUID';
COMMENT ON COLUMN "ledgers"."organization_id" IS '账本所属组织 ID';
COMMENT ON COLUMN "ledgers"."name" IS '账本显示名称，允许用户修改';
COMMENT ON COLUMN "ledgers"."type" IS '账本类型，当前业务使用 personal';
COMMENT ON COLUMN "ledgers"."is_default" IS '是否为组织当前未删除的默认账本，每个组织至多一个';
COMMENT ON COLUMN "ledgers"."created_by_user_id" IS '创建账本的用户 ID';
COMMENT ON COLUMN "ledgers"."deleted_at" IS '软删除时间，为空表示账本有效';
COMMENT ON COLUMN "ledgers"."deleted_by_user_id" IS '执行软删除的用户 ID';
COMMENT ON COLUMN "ledgers"."created_at" IS '账本创建时间，使用带时区时间戳';
COMMENT ON COLUMN "ledgers"."updated_at" IS '账本最后更新时间，使用带时区时间戳';

COMMENT ON TABLE "accounts" IS '组织级资金账户，余额由账户流水汇总得出';
COMMENT ON COLUMN "accounts"."id" IS '账户主键 UUID';
COMMENT ON COLUMN "accounts"."organization_id" IS '账户所属组织 ID';
COMMENT ON COLUMN "accounts"."name" IS '账户显示名称，允许用户修改';
COMMENT ON COLUMN "accounts"."type" IS '账户类型';
COMMENT ON COLUMN "accounts"."icon" IS '账户展示图标键，为空时使用客户端默认图标';
COMMENT ON COLUMN "accounts"."color" IS '账户展示颜色，为空时使用客户端默认颜色';
COMMENT ON COLUMN "accounts"."sort_order" IS '账户在列表中的升序排序值';
COMMENT ON COLUMN "accounts"."created_by_user_id" IS '创建账户的用户 ID';
COMMENT ON COLUMN "accounts"."deleted_at" IS '软删除时间，为空表示账户可用于新交易';
COMMENT ON COLUMN "accounts"."deleted_by_user_id" IS '执行软删除的用户 ID';
COMMENT ON COLUMN "accounts"."created_at" IS '账户创建时间，使用带时区时间戳';
COMMENT ON COLUMN "accounts"."updated_at" IS '账户最后更新时间，使用带时区时间戳';

COMMENT ON TABLE "categories" IS '账本内最多两级的收入或支出分类';
COMMENT ON COLUMN "categories"."id" IS '分类主键 UUID';
COMMENT ON COLUMN "categories"."organization_id" IS '分类所属组织 ID';
COMMENT ON COLUMN "categories"."ledger_id" IS '分类所属账本 ID';
COMMENT ON COLUMN "categories"."type" IS '分类的收入或支出类型，父子分类必须一致';
COMMENT ON COLUMN "categories"."parent_id" IS '父分类 ID；为空表示一级分类，非空表示二级分类';
COMMENT ON COLUMN "categories"."name" IS '分类显示名称，允许用户修改';
COMMENT ON COLUMN "categories"."icon" IS '分类展示图标键，为空时使用客户端默认图标';
COMMENT ON COLUMN "categories"."color" IS '分类展示颜色，为空时使用客户端默认颜色';
COMMENT ON COLUMN "categories"."sort_order" IS '同级分类的升序排序值';
COMMENT ON COLUMN "categories"."created_by_user_id" IS '创建分类的用户 ID';
COMMENT ON COLUMN "categories"."deleted_at" IS '软删除时间；历史交易仍可引用已删除分类';
COMMENT ON COLUMN "categories"."deleted_by_user_id" IS '执行软删除的用户 ID';
COMMENT ON COLUMN "categories"."created_at" IS '分类创建时间，使用带时区时间戳';
COMMENT ON COLUMN "categories"."updated_at" IS '分类最后更新时间，使用带时区时间戳';

COMMENT ON TABLE "transactions" IS '交易业务主记录，不直接保存账户余额';
COMMENT ON COLUMN "transactions"."id" IS '交易主键 UUID';
COMMENT ON COLUMN "transactions"."organization_id" IS '交易所属组织 ID';
COMMENT ON COLUMN "transactions"."ledger_id" IS '交易所属账本 ID';
COMMENT ON COLUMN "transactions"."type" IS '交易类型，排除型资金流不计入普通收支统计';
COMMENT ON COLUMN "transactions"."category_id" IS '收入或支出分类 ID；转账和排除型资金流为空';
COMMENT ON COLUMN "transactions"."amount_minor" IS '交易金额绝对值，单位为组织基础币种的最小货币单位';
COMMENT ON COLUMN "transactions"."occurred_at" IS '交易实际发生时刻，使用带时区时间戳';
COMMENT ON COLUMN "transactions"."occurred_on" IS '按组织时区计算的账务日期，用于筛选和统计';
COMMENT ON COLUMN "transactions"."payee" IS '交易对象或收付款方，可为空';
COMMENT ON COLUMN "transactions"."note" IS '交易备注，可为空且可能包含用户隐私';
COMMENT ON COLUMN "transactions"."created_by_user_id" IS '创建交易的用户 ID';
COMMENT ON COLUMN "transactions"."updated_by_user_id" IS '最后更新交易的用户 ID';
COMMENT ON COLUMN "transactions"."deleted_at" IS '软删除时间；非空时交易及流水不参与余额和统计';
COMMENT ON COLUMN "transactions"."deleted_by_user_id" IS '执行软删除的用户 ID';
COMMENT ON COLUMN "transactions"."created_at" IS '交易记录创建时间，使用带时区时间戳';
COMMENT ON COLUMN "transactions"."updated_at" IS '交易记录最后更新时间，使用带时区时间戳';

COMMENT ON TABLE "account_movements" IS '交易产生的不可独立编辑的有符号账户流水';
COMMENT ON COLUMN "account_movements"."id" IS '账户流水主键 UUID';
COMMENT ON COLUMN "account_movements"."organization_id" IS '账户流水所属组织 ID';
COMMENT ON COLUMN "account_movements"."transaction_id" IS '产生该流水的交易 ID';
COMMENT ON COLUMN "account_movements"."account_id" IS '资金发生变化的账户 ID';
COMMENT ON COLUMN "account_movements"."amount_minor" IS '有符号账户变动金额，单位为组织基础币种的最小货币单位；正数增加余额，负数减少余额';
COMMENT ON COLUMN "account_movements"."created_at" IS '账户流水创建时间，使用带时区时间戳且不可独立更新';

COMMENT ON COLUMN "organizations"."base_currency" IS '组织基础币种，首笔交易产生后不可修改';
COMMENT ON COLUMN "organizations"."timezone" IS '组织用于账务日期归属和展示的 IANA 时区';
