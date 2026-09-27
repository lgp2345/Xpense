import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 提前终止前的只读财务参考，不接受最终金额。 */
export const previewTerminationSchema = z
  .object({ contractId: z.string().uuid(), terminationDate: contractCalendarDateSchema })
  .strict();
export type PreviewTerminationDto = z.output<typeof previewTerminationSchema>;
