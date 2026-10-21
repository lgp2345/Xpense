import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type RentalPropertyBillingPage, rentalPropertyBillingPermissions } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { AccessService } from "../iam/access.service.js";
import { organizationDateTime } from "./contract-time.rules.js";
import type { ListPropertyBillingDto } from "./dto/list-property-billing.dto.js";
import { PropertyBillingRepository } from "./property-billing.repository.js";
import { toPropertyBillingCandidate } from "./property-billing.rules.js";
@Injectable()
export class PropertyBillingService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly repository: PropertyBillingRepository,
    private readonly access: AccessService,
  ) {}
  async list(auth: AuthContext, dto: ListPropertyBillingDto): Promise<RentalPropertyBillingPage> {
    for (const key of rentalPropertyBillingPermissions) this.access.assertPermission(auth, key);
    return this.db.transaction(
      async (tx) => {
        const context = await this.repository.readContext(auth.organizationId, dto.propertyId, tx);
        if (!context)
          throw new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁房产不存在" });
        const now = organizationDateTime(new Date(), context.timezone);
        const today = now.slice(0, 10);
        const page = await this.repository.scanSources(
          { organizationId: auth.organizationId, ...dto, now, timezone: context.timezone },
          tx,
        );
        return {
          ...context,
          today,
          items: page.sources.flatMap((source) => {
            const candidate = toPropertyBillingCandidate(source, today);
            return candidate ? [candidate] : [];
          }),
          unpaidBills: page.unpaidBills,
          nextAfterContractId: page.nextAfterContractId,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
