import { Injectable } from "@nestjs/common";
import { and, eq, type SQL, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import {
  rentalContractActions,
  rentalContractChanges,
  rentalContractDepositTerms,
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalContracts,
  rentalSpaces,
  rentalTenants,
} from "../../db/schema.js";
import { buildContractPartySensitiveSnapshotQuery } from "./contract-party-sensitive.queries.js";
import type {
  AppendContractChangeInput,
  AppendTerminationRevocationInput,
  ClipContractPartyPeriodsInput,
  ConfirmContractSnapshotsInput,
  CopyTerminalPartySetInput,
  FindContractPartySensitiveSnapshotInput,
  RentalContractPartySensitiveSnapshotRecord,
  ReplaceContractPartyPeriodsInput,
  ReplaceDraftDepositsInput,
  ReplaceDraftPartiesInput,
  ReplaceDraftSpacesInput,
  RestoreContractPartyPeriodsInput,
} from "./contracts.repository.types.js";

const MAX_SPACE_RECURSIVE_DEPTH = 3;

/** 构建确认时一次性固化四层空间路径的参数化更新。 */
function buildSpaceSnapshotStatement(input: ConfirmContractSnapshotsInput): SQL {
  return sql`
    WITH RECURSIVE "space_tree" AS (
      SELECT
        "space"."id",
        "space"."property_id",
        JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('id', "space"."id", 'name', "space"."name")) AS "path",
        0::integer AS "depth"
      FROM ${rentalSpaces} AS "space"
      INNER JOIN ${rentalContracts} AS "contract"
        ON "contract"."organization_id" = ${input.organizationId}
        AND "contract"."id" = ${input.contractId}
        AND "contract"."property_id" = "space"."property_id"
        AND "contract"."deleted_at" IS NULL
      WHERE "space"."organization_id" = ${input.organizationId}
        AND "space"."parent_id" IS NULL
        AND "space"."deleted_at" IS NULL

      UNION ALL

      SELECT
        "child"."id",
        "child"."property_id",
        "tree"."path" || JSONB_BUILD_ARRAY(
          JSONB_BUILD_OBJECT('id', "child"."id", 'name', "child"."name")
        ),
        "tree"."depth" + 1
      FROM ${rentalSpaces} AS "child"
      INNER JOIN "space_tree" AS "tree"
        ON "child"."parent_id" = "tree"."id"
        AND "child"."organization_id" = ${input.organizationId}
        AND "child"."property_id" = "tree"."property_id"
      WHERE "child"."deleted_at" IS NULL
        AND "tree"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
    )
    UPDATE ${rentalContractSpaces} AS "contract_space"
    SET
      "space_name_snapshot" = "space"."name",
      "space_code_snapshot" = "space"."code",
      "space_path_snapshot" = "tree"."path"
    FROM "space_tree" AS "tree"
    INNER JOIN ${rentalSpaces} AS "space"
      ON "space"."organization_id" = ${input.organizationId}
      AND "space"."property_id" = "tree"."property_id"
      AND "space"."id" = "tree"."id"
      AND "space"."deleted_at" IS NULL
    WHERE "contract_space"."organization_id" = ${input.organizationId}
      AND "contract_space"."contract_id" = ${input.contractId}
      AND "contract_space"."property_id" = "tree"."property_id"
      AND "contract_space"."space_id" = "tree"."id"
      AND "contract_space"."space_name_snapshot" IS NULL
  `;
}

/** 构建确认时固化承租方资料及合同有效期的参数化更新。 */
function buildPartySnapshotStatement(input: ConfirmContractSnapshotsInput): SQL {
  return sql`
    UPDATE ${rentalContractPartyPeriods} AS "period"
    SET
      "valid_from" = "contract"."start_date",
      "valid_to" = "contract"."end_date",
      "tenant_type_snapshot" = "tenant"."type",
      "tenant_name_snapshot" = "tenant"."name",
      "phone_snapshot" = "tenant"."phone",
      "email_snapshot" = "tenant"."email",
      "primary_contact_name_snapshot" = "tenant"."primary_contact_name",
      "primary_contact_phone_snapshot" = "tenant"."primary_contact_phone",
      "document_country_code_snapshot" = "tenant"."document_country_code",
      "document_type_snapshot" = "tenant"."document_type",
      "document_type_other_name_snapshot" = "tenant"."document_type_other_name",
      "masked_document_number_snapshot" = "tenant"."masked_document_number",
      "identity_snapshot_ciphertext" = "tenant"."sensitive_identity_ciphertext",
      "identity_snapshot_key_version" = "tenant"."sensitive_identity_key_version"
    FROM ${rentalTenants} AS "tenant", ${rentalContracts} AS "contract"
    WHERE "period"."organization_id" = ${input.organizationId}
      AND "period"."contract_id" = ${input.contractId}
      AND "period"."tenant_name_snapshot" IS NULL
      AND "tenant"."organization_id" = ${input.organizationId}
      AND "tenant"."id" = "period"."tenant_id"
      AND "tenant"."deleted_at" IS NULL
      AND "contract"."organization_id" = ${input.organizationId}
      AND "contract"."id" = ${input.contractId}
      AND "contract"."deleted_at" IS NULL
  `;
}

/** 构建确认时按合同租金固化最终押金金额的参数化更新。 */
function buildDepositSnapshotStatement(input: ConfirmContractSnapshotsInput): SQL {
  return sql`
    UPDATE ${rentalContractDepositTerms} AS "deposit"
    SET "final_amount_minor" = CASE
      WHEN "deposit"."calculation_mode" = 'fixed_amount' THEN "deposit"."fixed_amount_minor"
      ELSE ROUND("contract"."rent_amount_minor"::numeric * "deposit"."rent_multiple")::bigint
    END,
    "updated_at" = NOW()
    FROM ${rentalContracts} AS "contract"
    WHERE "deposit"."organization_id" = ${input.organizationId}
      AND "deposit"."contract_id" = ${input.contractId}
      AND "deposit"."final_amount_minor" IS NULL
      AND "contract"."organization_id" = ${input.organizationId}
      AND "contract"."id" = ${input.contractId}
      AND "contract"."deleted_at" IS NULL
  `;
}

/** 负责合同空间、承租方、押金、快照及变更记录的事务内持久化。 */
@Injectable()
export class ContractRelationsRepository {
  /** 读取指定合同、承租方和生效日的加密历史快照，供授权服务单独解密。 */
  async findPartySensitiveSnapshot(
    input: FindContractPartySensitiveSnapshotInput,
    executor: AppDbExecutor,
  ): Promise<RentalContractPartySensitiveSnapshotRecord | null> {
    const [snapshot] = await buildContractPartySensitiveSnapshotQuery(executor, input);
    return snapshot ?? null;
  }

  /** 以组织和合同双重边界替换草稿空间关系。 */
  async replaceDraftSpaces(input: ReplaceDraftSpacesInput, executor: AppDbExecutor): Promise<void> {
    await executor
      .delete(rentalContractSpaces)
      .where(
        and(
          eq(rentalContractSpaces.organizationId, input.organizationId),
          eq(rentalContractSpaces.contractId, input.contractId),
        ),
      );
    if (input.spaces.length === 0) return;
    await executor.insert(rentalContractSpaces).values(
      input.spaces.map((space) => ({
        organizationId: input.organizationId,
        contractId: input.contractId,
        propertyId: input.propertyId,
        spaceId: space.spaceId,
        rentAllocationMinor: space.rentAllocationMinor ?? null,
      })),
    );
  }

  /** 以组织和合同双重边界替换草稿承租方关系。 */
  async replaceDraftParties(
    input: ReplaceDraftPartiesInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor
      .delete(rentalContractPartyPeriods)
      .where(
        and(
          eq(rentalContractPartyPeriods.organizationId, input.organizationId),
          eq(rentalContractPartyPeriods.contractId, input.contractId),
        ),
      );
    if (input.parties.length === 0) return;
    await executor.insert(rentalContractPartyPeriods).values(
      input.parties.map((party) => ({
        organizationId: input.organizationId,
        contractId: input.contractId,
        tenantId: party.tenantId,
        validFrom: null,
        validTo: null,
        isPrimaryPayer: party.isPrimaryPayer,
      })),
    );
  }

  /** 以组织和合同双重边界替换草稿押金约定。 */
  async replaceDraftDeposits(
    input: ReplaceDraftDepositsInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor
      .delete(rentalContractDepositTerms)
      .where(
        and(
          eq(rentalContractDepositTerms.organizationId, input.organizationId),
          eq(rentalContractDepositTerms.contractId, input.contractId),
        ),
      );
    if (input.deposits.length === 0) return;
    await executor.insert(rentalContractDepositTerms).values(
      input.deposits.map((deposit) => ({
        organizationId: input.organizationId,
        contractId: input.contractId,
        ...deposit,
        finalAmountMinor: null,
      })),
    );
  }

  /** 在调用方事务中固化空间、承租方和最终押金快照，已有快照不覆盖。 */
  async confirmSnapshots(
    input: ConfirmContractSnapshotsInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor.execute(buildSpaceSnapshotStatement(input));
    await executor.execute(buildPartySnapshotStatement(input));
    await executor.execute(buildDepositSnapshotStatement(input));
  }

  /** 删除生效日及未来区段、关闭此前区段，并固化新的承租方区段。 */
  async replacePartyPeriods(
    input: ReplaceContractPartyPeriodsInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (input.parties.length === 0) throw new RangeError("合同承租方不能为空");
    await executor.execute(sql`
      DELETE FROM ${rentalContractPartyPeriods}
      WHERE "organization_id" = ${input.organizationId}
        AND "contract_id" = ${input.contractId}
        AND "valid_from" >= ${input.effectiveDate}::date
    `);
    await executor.execute(sql`
      UPDATE ${rentalContractPartyPeriods}
      SET "valid_to" = ${input.effectiveDate}::date - 1
      WHERE "organization_id" = ${input.organizationId}
        AND "contract_id" = ${input.contractId}
        AND "valid_from" < ${input.effectiveDate}::date
        AND "valid_to" >= ${input.effectiveDate}::date
    `);
    const requestedParties = sql.join(
      input.parties.map(
        (party) => sql`(${party.tenantId}::uuid, ${party.isPrimaryPayer}::boolean)`,
      ),
      sql`, `,
    );
    await executor.execute(sql`
      WITH "requested_parties" ("tenant_id", "is_primary_payer") AS (
        VALUES ${requestedParties}
      )
      INSERT INTO ${rentalContractPartyPeriods} (
        "organization_id", "contract_id", "tenant_id", "valid_from", "valid_to",
        "is_primary_payer", "tenant_type_snapshot", "tenant_name_snapshot", "phone_snapshot",
        "email_snapshot", "primary_contact_name_snapshot", "primary_contact_phone_snapshot",
        "document_country_code_snapshot",
        "document_type_snapshot", "document_type_other_name_snapshot",
        "masked_document_number_snapshot",
        "identity_snapshot_ciphertext", "identity_snapshot_key_version"
      )
      SELECT
        ${input.organizationId}, ${input.contractId}, "tenant"."id", ${input.effectiveDate}::date,
        COALESCE("contract"."termination_date", "contract"."end_date"),
        "requested"."is_primary_payer", "tenant"."type", "tenant"."name",
        "tenant"."phone", "tenant"."email", "tenant"."primary_contact_name",
        "tenant"."primary_contact_phone",
        "tenant"."document_country_code", "tenant"."document_type",
        "tenant"."document_type_other_name", "tenant"."masked_document_number",
        "tenant"."sensitive_identity_ciphertext",
        "tenant"."sensitive_identity_key_version"
      FROM "requested_parties" AS "requested"
      INNER JOIN ${rentalTenants} AS "tenant"
        ON "tenant"."organization_id" = ${input.organizationId}
        AND "tenant"."id" = "requested"."tenant_id"
        AND "tenant"."deleted_at" IS NULL
      INNER JOIN ${rentalContracts} AS "contract"
        ON "contract"."organization_id" = ${input.organizationId}
        AND "contract"."id" = ${input.contractId}
        AND "contract"."deleted_at" IS NULL
    `);
  }

  /** 将合同承租方区段裁剪至实际占用最后一天，不制造新的身份快照。 */
  async clipPartyPeriodsToActualEnd(
    input: ClipContractPartyPeriodsInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor.execute(sql`
      DELETE FROM ${rentalContractPartyPeriods}
      WHERE "organization_id" = ${input.organizationId}
        AND "contract_id" = ${input.contractId}
        AND "valid_from" > ${input.actualEnd}::date
    `);
    await executor.execute(sql`
      UPDATE ${rentalContractPartyPeriods}
      SET "valid_to" = ${input.actualEnd}::date
      WHERE "organization_id" = ${input.organizationId}
        AND "contract_id" = ${input.contractId}
        AND "valid_from" <= ${input.actualEnd}::date
        AND "valid_to" > ${input.actualEnd}::date
    `);
  }

  /** 将终止时保留的完整末期承租方 cohort 恢复至原合同结束日。 */
  async restoreTerminalPartyPeriods(
    input: RestoreContractPartyPeriodsInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    const result = await executor.execute(sql`
      WITH "terminal_period" AS (
        SELECT MAX("valid_from") AS "valid_from"
        FROM ${rentalContractPartyPeriods}
        WHERE "organization_id" = ${input.organizationId}
          AND "contract_id" = ${input.contractId}
          AND "valid_to" = ${input.terminatedAt}::date
      )
      UPDATE ${rentalContractPartyPeriods} AS "period"
      SET "valid_to" = ${input.originalEnd}::date
      FROM "terminal_period"
      WHERE "period"."organization_id" = ${input.organizationId}
        AND "period"."contract_id" = ${input.contractId}
        AND "period"."valid_from" = "terminal_period"."valid_from"
        AND "period"."valid_to" = ${input.terminatedAt}::date
      RETURNING "period"."id"
    `);
    if (Array.isArray(result) && result.length === 0) {
      throw new Error("合同缺少可恢复的承租方区段");
    }
  }

  /** 在数据库内不解密地复制源合同最后承租方快照集至续租草稿。 */
  async copyTerminalPartySetToDraft(
    input: CopyTerminalPartySetInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    const result = await executor.execute(sql`
      INSERT INTO ${rentalContractPartyPeriods} (
        "organization_id", "contract_id", "tenant_id", "valid_from", "valid_to",
        "is_primary_payer", "tenant_type_snapshot", "tenant_name_snapshot", "phone_snapshot",
        "email_snapshot", "primary_contact_name_snapshot", "primary_contact_phone_snapshot",
        "document_country_code_snapshot",
        "document_type_snapshot", "document_type_other_name_snapshot",
        "masked_document_number_snapshot",
        "identity_snapshot_ciphertext", "identity_snapshot_key_version"
      )
      SELECT
        "source"."organization_id", ${input.targetContractId}, "source"."tenant_id",
        ${input.validFrom}::date, ${input.validTo}::date, "source"."is_primary_payer",
        "source"."tenant_type_snapshot", "source"."tenant_name_snapshot", "source"."phone_snapshot",
        "source"."email_snapshot", "source"."primary_contact_name_snapshot",
        "source"."primary_contact_phone_snapshot",
        "source"."document_country_code_snapshot", "source"."document_type_snapshot",
        "source"."document_type_other_name_snapshot", "source"."masked_document_number_snapshot",
        "source"."identity_snapshot_ciphertext",
        "source"."identity_snapshot_key_version"
      FROM ${rentalContractPartyPeriods} AS "source"
      WHERE "source"."organization_id" = ${input.organizationId}
        AND "source"."contract_id" = ${input.contractId}
        AND "source"."valid_from" = (
          SELECT MAX("candidate"."valid_from")
          FROM ${rentalContractPartyPeriods} AS "candidate"
          WHERE "candidate"."organization_id" = ${input.organizationId}
            AND "candidate"."contract_id" = ${input.contractId}
        )
      RETURNING "tenant_id"
    `);
    if (Array.isArray(result) && result.length === 0) {
      throw new Error("合同缺少可复制的末期承租方区段");
    }
  }

  /** 追加组织作用域合同承租方变更审计记录。 */
  async appendChange(input: AppendContractChangeInput, executor: AppDbExecutor): Promise<void> {
    await executor.insert(rentalContractChanges).values(input);
  }

  /** 在当前事务内追加终止撤销动作，原因只进入专用业务历史表。 */
  async appendTerminationRevocation(
    input: AppendTerminationRevocationInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor.insert(rentalContractActions).values({
      organizationId: input.organizationId,
      contractId: input.contractId,
      type: "termination_revoked",
      reason: input.reason,
      terminationDateBeforeRevoke: input.terminationDateBeforeRevoke,
      createdByUserId: input.createdByUserId,
    });
  }
}
