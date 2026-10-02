import { ConflictException, Injectable } from "@nestjs/common";
import type { RentalContractChargeSetup } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import type { FinanceScope } from "./rental-finance.types.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

/** 在合同外层事务和锁内初始化收费标准及可选交接底数。 */
@Injectable()
export class ContractChargeSetupService {
  constructor(
    private readonly terms: ChargeTermsRepository,
    private readonly readings: MeterReadingsRepository,
    private readonly sources: RentalFinanceSourceService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async save(
    auth: AuthContext,
    scope: FinanceScope,
    setup: RentalContractChargeSetup,
    tx: AppDbTransaction,
  ): Promise<void> {
    this.access.assertPermission(auth, "rental_charges:update");
    if (setup.baselineReadings.length) this.access.assertPermission(auth, "rental_meters:update");
    if (scope.organizationId !== auth.organizationId) throw this.conflict("合同不属于当前组织");
    const snapshot = await this.sources.read(scope, tx);
    const draft = snapshot.contract.lifecycleStatus === "draft";
    const reason = draft ? "修改合同草稿收费事项" : "创建合同初始化收费事项";
    const terms = setup.chargeTerms;
    if (setup.baselineReadings.length && snapshot.contract.spaces.length !== 1)
      throw this.conflict("登记入住底数需要唯一空间");
    for (const reading of setup.baselineReadings) {
      if (
        !(reading.kind === "water"
          ? terms.waterCollectionEnabled
          : terms.electricityCollectionEnabled)
      )
        throw this.conflict("不代收项目不能登记入住底数");
    }
    await this.terms.save(
      scope,
      {
        ...terms,
        waterUnitPrice: terms.waterCollectionEnabled ? terms.waterUnitPrice : "0.0000",
        electricityUnitPrice: terms.electricityCollectionEnabled
          ? terms.electricityUnitPrice
          : "0.0000",
      },
      reason,
      { userId: auth.userId },
      tx,
    );
    if (setup.baselineReadings.length) {
      const spaceId = snapshot.contract.spaces[0]!.spaceId;
      await this.readings.saveBaseline(
        scope,
        setup.baselineReadings.map((reading) => ({ ...reading, spaceId, predecessorId: null })),
        reason,
        { userId: auth.userId },
        tx,
      );
    }
    await this.audit.appendRequired(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "rental_charge_terms.updated",
        targetType: "rental_contract",
        targetId: scope.contractId,
        result: "succeeded",
        metadata: { reason, readingKinds: setup.baselineReadings.map(({ kind }) => kind) },
      },
      tx,
    );
  }

  /** 草稿更换空间时清除未使用底数，避免将旧表计转接到新空间。 */
  async syncDraftSpace(
    auth: AuthContext,
    scope: FinanceScope,
    spaceIds: string[],
    tx: AppDbTransaction,
  ): Promise<void> {
    const readings = await this.readings.list(scope, tx);
    const stale = readings.filter(({ spaceId }) => !spaceIds.includes(spaceId));
    if (!stale.length) return;
    this.access.assertPermission(auth, "rental_meters:update");
    if (stale.some(({ predecessorId }) => predecessorId !== null))
      throw this.conflict("旧空间读数已使用，不能更换空间");
    await this.readings.clearDraftBaselines(
      scope,
      stale.map(({ id }) => id),
      tx,
    );
  }

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}
