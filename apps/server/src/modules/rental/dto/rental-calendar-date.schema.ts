import { z } from "zod";
import { assertCalendarDate } from "../contract-date.rules.js";

/** 合同 DTO 共用的严格公历日期校验规则。 */
export const contractCalendarDateSchema = z.string().superRefine((value, context) => {
  try {
    assertCalendarDate(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "合同日期无效",
    });
  }
});
