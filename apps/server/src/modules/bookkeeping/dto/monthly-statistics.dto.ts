import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const calendarMonthPattern = /^(?!0000)(\d{4})-(0[1-9]|1[0-2])$/;

/** 月度统计查询校验规则；月份是 0001-01 至 9999-12 的严格公历年月。 */
export const monthlyStatisticsSchema = z
  .object({
    month: z.string().regex(calendarMonthPattern, "月份必须是有效的 YYYY-MM 公历年月"),
    ledgerId: z.string().uuid().optional(),
  })
  .strict();

/** 月度统计查询 DTO。 */
export class MonthlyStatisticsDto extends createZodDto(monthlyStatisticsSchema) {}
