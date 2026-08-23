import { transactionTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 判断字符串是否是严格存在的公历日期。 */
function isCalendarDate(value: string): boolean {
  const match = calendarDatePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const calendarDateSchema = z
  .string()
  .regex(calendarDatePattern)
  .refine(isCalendarDate, "日期必须是有效的 YYYY-MM-DD 公历日期");

/** 交易分页及筛选查询校验规则。 */
export const listTransactionsSchema = z
  .object({
    ledgerId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    type: z.enum(transactionTypes).optional(),
    keyword: z.string().trim().min(1).max(200).optional(),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "开始日期不能晚于结束日期",
    path: ["to"],
  });

/** 交易分页及筛选查询 DTO。 */
export class ListTransactionsDto extends createZodDto(listTransactionsSchema) {}
