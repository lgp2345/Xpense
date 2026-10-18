import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { AppDbExecutor } from "../../db/db.module.js";
import {
  organizations,
  rentalBillingStarts,
  rentalBills,
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalProperties,
  rentalSettlements,
} from "../../db/schema.js";
import { toBillingContractDates } from "./billing-contract-dates.rules.js";
import { readPropertyAncestors, scanPropertyContracts } from "./property-billing.queries.js";
import type {
  PropertyBillingScan,
  PropertyBillingScanInput,
} from "./property-billing.repository.types.js";
import type { PropertyBillingSource } from "./property-billing.rules.js";
@Injectable()
export class PropertyBillingRepository {
  async readContext(organizationId: string, propertyId: string, tx: AppDbExecutor) {
    const [context] = await tx
      .select({
        id: rentalProperties.id,
        name: rentalProperties.name,
        timezone: organizations.timezone,
      })
      .from(rentalProperties)
      .innerJoin(organizations, eq(organizations.id, rentalProperties.organizationId))
      .where(
        and(
          eq(rentalProperties.organizationId, organizationId),
          eq(rentalProperties.id, propertyId),
          isNull(rentalProperties.deletedAt),
        ),
      )
      .limit(1);
    return context
      ? { property: { id: context.id, name: context.name }, timezone: context.timezone }
      : null;
  }
  async scanSources(
    input: PropertyBillingScanInput,
    tx: AppDbExecutor,
  ): Promise<PropertyBillingScan> {
    const scanned = await scanPropertyContracts(input, tx);
    const contracts = scanned.slice(0, input.pageSize);
    const ids = contracts.map((c) => c.id);
    const nextAfterContractId =
      scanned.length > input.pageSize ? (contracts.at(-1)?.id ?? null) : null;
    if (!ids.length) return { sources: [], nextAfterContractId };
    const org = input.organizationId;
    const [spaces, bills, starts, settlements, parties] = await Promise.all([
      tx
        .select({
          contractId: rentalContractSpaces.contractId,
          spaceId: rentalContractSpaces.spaceId,
        })
        .from(rentalContractSpaces)
        .where(
          and(
            eq(rentalContractSpaces.organizationId, org),
            eq(rentalContractSpaces.propertyId, input.propertyId),
            inArray(rentalContractSpaces.contractId, ids),
          ),
        ),
      tx
        .select({
          contractId: rentalBills.contractId,
          periodStart: rentalBills.periodStart,
          periodEnd: rentalBills.periodEnd,
        })
        .from(rentalBills)
        .where(
          and(
            eq(rentalBills.organizationId, org),
            inArray(rentalBills.contractId, ids),
            eq(rentalBills.type, "period"),
            eq(rentalBills.status, "active"),
          ),
        ),
      tx
        .select({
          contractId: rentalBillingStarts.contractId,
          firstPeriodStart: rentalBillingStarts.firstPeriodStart,
        })
        .from(rentalBillingStarts)
        .where(
          and(
            eq(rentalBillingStarts.organizationId, org),
            inArray(rentalBillingStarts.contractId, ids),
            isNull(rentalBillingStarts.invalidatedAt),
          ),
        ),
      tx
        .select({ contractId: rentalSettlements.contractId })
        .from(rentalSettlements)
        .where(
          and(
            eq(rentalSettlements.organizationId, org),
            inArray(rentalSettlements.contractId, ids),
          ),
        ),
      tx
        .select({
          contractId: rentalContractPartyPeriods.contractId,
          name: rentalContractPartyPeriods.tenantNameSnapshot,
          validFrom: rentalContractPartyPeriods.validFrom,
          validTo: rentalContractPartyPeriods.validTo,
        })
        .from(rentalContractPartyPeriods)
        .where(
          and(
            eq(rentalContractPartyPeriods.organizationId, org),
            inArray(rentalContractPartyPeriods.contractId, ids),
          ),
        )
        .orderBy(asc(rentalContractPartyPeriods.id)),
    ]);
    const ancestors = await readPropertyAncestors(
      input,
      spaces.map((s) => s.spaceId),
      tx,
    );
    const nodes = new Map(ancestors.map((n) => [n.id, n]));
    const sources: PropertyBillingSource[] = [];
    for (const raw of contracts) {
      const relations = spaces.filter((s) => s.contractId === raw.id);
      if (
        !["confirmed", "terminated"].includes(raw.lifecycleStatus) ||
        raw.cancelledAt ||
        relations.length !== 1 ||
        settlements.some((s) => s.contractId === raw.id)
      )
        continue;
      const c = toBillingContractDates(raw);
      if (
        !c.startDate ||
        !c.endDate ||
        c.rentAmountMinor === null ||
        c.billingAnchor === null ||
        c.paymentIntervalMonths === null ||
        c.dueDaysBefore === null
      )
        throw new RangeError("合同缺少计费信息");
      const spaceId = relations[0]!.spaceId;
      const path = [];
      const visited = new Set<string>();
      let node = nodes.get(spaceId);
      while (node) {
        if (visited.has(node.id)) throw new Error("空间祖先路径存在循环");
        visited.add(node.id);
        path.unshift(node);
        if (node.parentId === null) break;
        node = nodes.get(node.parentId);
      }
      if (!path.length || path[0]!.parentId !== null) throw new Error("空间祖先路径不完整");
      sources.push({
        contractId: c.id,
        spaceId,
        terms: {
          startDate: c.startDate,
          endDate: c.endDate,
          rentAmountMinor: c.rentAmountMinor,
          billingAnchor: c.billingAnchor,
          paymentIntervalMonths: c.paymentIntervalMonths as 1 | 3 | 6 | 12,
          dueDaysBefore: c.dueDaysBefore,
        },
        lifecycleStatus: c.lifecycleStatus,
        cancelled: false,
        settled: false,
        spaceCount: relations.length,
        terminationDate: c.terminationDate,
        firstPeriodStart: starts.find((s) => s.contractId === c.id)?.firstPeriodStart ?? null,
        activePeriods: bills
          .filter((b) => b.contractId === c.id)
          .map((b) => {
            if (!b.periodStart || !b.periodEnd) throw new Error("普通账单缺少账期");
            return { periodStart: b.periodStart, periodEnd: b.periodEnd };
          }),
        path,
        tenantPeriods: parties
          .filter((p) => p.contractId === c.id)
          .flatMap((p) =>
            p.name && p.validFrom && p.validTo
              ? [{ name: p.name, validFrom: p.validFrom, validTo: p.validTo }]
              : [],
          ),
      });
    }
    return { sources, nextAfterContractId };
  }
}
