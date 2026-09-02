import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  contractMutableShape,
  contractPartyInputSchema,
  contractSpaceInputSchema,
  refineContractDtoCollections,
} from "./create-contract.dto.js";

/** 校验局部更新中无需当前合同快照即可判断的字段组合。 */
function refineContractUpdateCollections(
  value: {
    startDate?: string | null;
    endDate?: string | null;
    rentAmountMinor?: number | null;
    parties?: Array<z.infer<typeof contractPartyInputSchema>>;
    spaces?: Array<z.infer<typeof contractSpaceInputSchema>>;
  },
  context: z.RefinementCtx,
): void {
  const requiresMergedRent = value.rentAmountMinor === undefined && value.spaces !== undefined;
  refineContractDtoCollections(
    requiresMergedRent ? { ...value, spaces: undefined } : value,
    context,
  );
  if (!requiresMergedRent || !value.spaces) return;
  if (new Set(value.spaces.map((space) => space.spaceId)).size !== value.spaces.length) {
    context.addIssue({ code: "custom", message: "合同空间不能重复" });
  }
  const allocatedCount = value.spaces.filter(
    (space) => space.rentAllocationMinor !== undefined,
  ).length;
  if (allocatedCount !== 0 && allocatedCount !== value.spaces.length) {
    context.addIssue({ code: "custom", message: "空间租金分摊必须全部填写或全部不填" });
  }
}

/** 更新租赁合同请求校验规则。 */
export const updateContractSchema = z
  .object({ id: z.string().uuid(), ...contractMutableShape })
  .strict()
  .refine(
    (value) =>
      Object.entries(value).some(([key, fieldValue]) => key !== "id" && fieldValue !== undefined),
    "至少需要提供一项合同信息",
  )
  .superRefine(refineContractUpdateCollections);

/** 更新租赁合同请求 DTO。 */
export class UpdateContractDto extends createZodDto(updateContractSchema) {}

export const updateRentalContractSchema = updateContractSchema;
export { UpdateContractDto as UpdateRentalContractDto };
