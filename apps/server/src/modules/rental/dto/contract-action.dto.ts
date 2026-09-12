import { z } from "zod";

const idOnlySchema = z.object({ id: z.string().uuid() }).strict();
const reasonActionSchema = z
  .object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(1000) })
  .strict();

/** 确认租赁合同请求校验规则。 */
export const confirmContractSchema = idOnlySchema;
/** 取消租赁合同请求校验规则。 */
export const cancelContractSchema = reasonActionSchema;
/** 撤销未来合同终止请求校验规则。 */
export const revokeContractTerminationSchema = reasonActionSchema;
/** 创建续租草稿请求校验规则。 */
export const renewContractSchema = idOnlySchema;
/** 删除合同草稿请求校验规则。 */
export const deleteContractSchema = idOnlySchema;

/** 确认租赁合同请求 DTO，由 confirmContractSchema 校验并转换。 */
export type ConfirmContractDto = z.output<typeof confirmContractSchema>;
/** 取消租赁合同请求 DTO，由 cancelContractSchema 校验并转换。 */
export type CancelContractDto = z.output<typeof cancelContractSchema>;
/** 撤销未来合同终止请求 DTO，由 revokeContractTerminationSchema 校验并转换。 */
export type RevokeContractTerminationDto = z.output<typeof revokeContractTerminationSchema>;
/** 创建续租草稿请求 DTO，由 renewContractSchema 校验并转换。 */
export type RenewContractDto = z.output<typeof renewContractSchema>;
/** 删除合同草稿请求 DTO，由 deleteContractSchema 校验并转换。 */
export type DeleteContractDto = z.output<typeof deleteContractSchema>;

export const confirmRentalContractSchema = confirmContractSchema;
export const cancelRentalContractSchema = cancelContractSchema;
export const revokeRentalContractTerminationSchema = revokeContractTerminationSchema;
export const renewRentalContractSchema = renewContractSchema;
export const deleteRentalContractSchema = deleteContractSchema;
export type {
  CancelContractDto as CancelRentalContractDto,
  ConfirmContractDto as ConfirmRentalContractDto,
  DeleteContractDto as DeleteRentalContractDto,
  RenewContractDto as RenewRentalContractDto,
  RevokeContractTerminationDto as RevokeRentalContractTerminationDto,
};
