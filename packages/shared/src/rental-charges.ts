/** 独立空间水电表类型。 */
export const rentalMeterKinds = ["water", "electricity"] as const;
export type RentalMeterKind = (typeof rentalMeterKinds)[number];

/** 合同固定收费条目。 */
export type RentalFixedFee = {
  id: string;
  name: string;
  periodAmountMinor: number;
};

/** 合同当前的非租金收费标准。 */
export type RentalChargeTerms = {
  contractId: string;
  version: string;
  waterCollectionEnabled: boolean;
  electricityCollectionEnabled: boolean;
  waterUnitPrice: string;
  electricityUnitPrice: string;
  fixedFees: RentalFixedFee[];
};

/** 修改合同默认非租金收费标准的请求。 */
export type UpdateRentalChargeTermsRequest = {
  waterCollectionEnabled?: boolean;
  electricityCollectionEnabled?: boolean;
  contractId: string;
  expectedVersion: string;
  idempotencyKey: string;
  reason: string;
  waterUnitPrice: string;
  electricityUnitPrice: string;
  fixedFees: RentalFixedFee[];
};

/** 水电表计读数；读数和单价最多四位小数。 */
export type RentalMeterReadingInput = {
  kind: RentalMeterKind;
  reading: string;
};

/** 为合同登记水电入住底数。 */
export type UpdateRentalMeterBaselineRequest = {
  contractId: string;
  readings: RentalMeterReadingInput[];
  expectedVersion: string;
  idempotencyKey: string;
  reason: string;
};

/** 创建合同或更新草稿时原子保存的收费设置。 */
export type RentalContractChargeSetup = {
  chargeTerms: Pick<
    RentalChargeTerms,
    | "waterCollectionEnabled"
    | "electricityCollectionEnabled"
    | "waterUnitPrice"
    | "electricityUnitPrice"
    | "fixedFees"
  >;
  baselineReadings: RentalMeterReadingInput[];
};

/** 账单和结算共用的有符号额外费用。 */
export type RentalExtraFeeInput = { id: string; name: string; amountMinor: number; note: string };
