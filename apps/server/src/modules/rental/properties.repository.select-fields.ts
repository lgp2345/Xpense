import { sql } from "drizzle-orm";

import { rentalProperties } from "../../db/schema.js";

/** 房产完整持久化记录字段。 */
export const propertyRecordFields = {
  id: rentalProperties.id,
  organizationId: rentalProperties.organizationId,
  ledgerId: rentalProperties.ledgerId,
  name: rentalProperties.name,
  type: rentalProperties.type,
  customTypeName: rentalProperties.customTypeName,
  countryCode: rentalProperties.countryCode,
  province: rentalProperties.province,
  city: rentalProperties.city,
  district: rentalProperties.district,
  addressLine: rentalProperties.addressLine,
  note: rentalProperties.note,
  isActive: rentalProperties.isActive,
  createdByUserId: rentalProperties.createdByUserId,
  updatedByUserId: rentalProperties.updatedByUserId,
  deletedAt: rentalProperties.deletedAt,
  deletedByUserId: rentalProperties.deletedByUserId,
  createdAt: rentalProperties.createdAt,
  updatedAt: rentalProperties.updatedAt,
};

/** 房产列表摘要字段；空间数量使用相关标量子查询，避免加载或连接空间行。 */
const propertySpaceCountFields = {
  spaceCount: sql<number>`(
    SELECT COUNT(*)
    FROM "rental_spaces"
    WHERE "rental_spaces"."organization_id" = "rental_properties"."organization_id"
      AND "rental_spaces"."property_id" = "rental_properties"."id"
      AND "rental_spaces"."deleted_at" IS NULL
  )`.mapWith(Number),
  rentableSpaceCount: sql<number>`(
    SELECT COUNT(*)
    FROM "rental_spaces"
    WHERE "rental_spaces"."organization_id" = "rental_properties"."organization_id"
      AND "rental_spaces"."property_id" = "rental_properties"."id"
      AND "rental_spaces"."deleted_at" IS NULL
      AND "rental_spaces"."is_rentable" IS TRUE
  )`.mapWith(Number),
};

/** 房产列表摘要字段；空间数量使用相关标量子查询，避免加载或连接空间行。 */
export const propertySummaryFields = {
  id: rentalProperties.id,
  ledgerId: rentalProperties.ledgerId,
  name: rentalProperties.name,
  type: rentalProperties.type,
  customTypeName: rentalProperties.customTypeName,
  countryCode: rentalProperties.countryCode,
  province: rentalProperties.province,
  city: rentalProperties.city,
  district: rentalProperties.district,
  addressLine: rentalProperties.addressLine,
  isActive: rentalProperties.isActive,
  ...propertySpaceCountFields,
  updatedAt: rentalProperties.updatedAt,
};

/** 房产详情字段；与列表摘要一致统计空间，并补充详情专用字段。 */
/** 房产详情中按 actual end/date 桶一次聚合当前/未来合同计数。 */
export function propertyDetailFields(today = "CURRENT_DATE") {
  const currentDate = today === "CURRENT_DATE" ? sql`CURRENT_DATE` : sql`${today}::date`;
  const contractScope = sql`
    FROM "rental_contracts" AS "contract"
    WHERE "contract"."organization_id" = "rental_properties"."organization_id"
      AND "contract"."property_id" = "rental_properties"."id"
      AND "contract"."deleted_at" IS NULL
      AND "contract"."status" IN ('confirmed', 'terminated')
  `;
  return {
    ...propertySummaryFields,
    activeContractCount: sql<number>`(
      SELECT COUNT(*) ${contractScope}
      AND "contract"."start_date" <= ${currentDate}
      AND ${currentDate} < COALESCE("contract"."termination_date", "contract"."end_date") - INTERVAL '30 days'
    )`.mapWith(Number),
    upcomingContractCount: sql<number>`(
      SELECT COUNT(*) ${contractScope}
      AND "contract"."start_date" > ${currentDate}
    )`.mapWith(Number),
    expiringSoonContractCount: sql<number>`(
      SELECT COUNT(*) ${contractScope}
      AND "contract"."start_date" <= ${currentDate}
      AND ${currentDate} >= COALESCE("contract"."termination_date", "contract"."end_date") - INTERVAL '30 days'
      AND ${currentDate} <= COALESCE("contract"."termination_date", "contract"."end_date")
    )`.mapWith(Number),
    note: rentalProperties.note,
    createdAt: rentalProperties.createdAt,
  };
}
