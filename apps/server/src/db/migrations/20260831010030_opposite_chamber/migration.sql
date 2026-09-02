CREATE TYPE "rental_contract_action_type" AS ENUM('termination_revoked');--> statement-breakpoint
CREATE TABLE "rental_contract_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" "rental_contract_action_type" NOT NULL,
	"reason" text NOT NULL,
	"termination_date_before_revoke" date NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contract_actions_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX "rental_contract_actions_contract_created_at_idx" ON "rental_contract_actions" ("organization_id","contract_id","created_at");--> statement-breakpoint
ALTER TABLE "rental_contract_actions" ADD CONSTRAINT "rental_contract_actions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rental_contract_actions" ADD CONSTRAINT "rental_contract_actions_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id");
--> statement-breakpoint
COMMENT ON TYPE "rental_contract_action_type" IS '租赁合同领域动作类型';--> statement-breakpoint
COMMENT ON TABLE "rental_contract_actions" IS '只追加保存租赁合同终止撤销业务原因的领域动作历史';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."id" IS '合同动作历史主键 UUID';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."organization_id" IS '动作所属组织 ID';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."contract_id" IS '被操作的租赁合同 ID';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."type" IS '固定为 termination_revoked 的合同动作类型';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."reason" IS '终止撤销业务原因正文，仅保存在受控领域历史表';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."termination_date_before_revoke" IS '清空终止字段前保存的最后占用日事实快照';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."created_by_user_id" IS '执行合同动作的用户 ID';--> statement-breakpoint
COMMENT ON COLUMN "rental_contract_actions"."created_at" IS '合同动作历史创建时间，使用带时区时间戳';
