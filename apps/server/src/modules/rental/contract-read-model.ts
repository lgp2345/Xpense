import type {
  RentalContractDetail,
  RentalContractSummary,
  RentalPaymentIntervalMonths,
} from "@xpense/shared";

import type {
  RentalContractDetailRecord,
  RentalContractSummaryRecord,
} from "./contracts.repository.types.js";

/** 将仓储合同详情映射为共享脱敏 API 契约，供合同与账单来源复用。 */
export function toContractDetail(contract: RentalContractDetailRecord): RentalContractDetail {
  return {
    ...toContractSummary(contract),
    billingAnchor: contract.billingAnchor,
    paymentIntervalMonths: contract.paymentIntervalMonths as RentalPaymentIntervalMonths | null,
    dueDaysBefore: contract.dueDaysBefore,
    hasScheduledTermination: contract.hasScheduledTermination,
    renewedFromContractId: contract.renewedFromContractId,
    cancellationReason: contract.cancellationReason,
    terminationDate: contract.terminationDate,
    terminationReason: contract.terminationReason,
    note: contract.note,
    spaces: contract.spaces,
    parties: contract.parties.map((party) => ({
      tenantId: party.tenantId,
      type: party.tenantType,
      name: party.tenantName,
      phone: party.phone,
      email: party.email,
      primaryContactName: party.primaryContactName,
      primaryContactPhone: party.primaryContactPhone,
      documentCountryCode: party.documentCountryCode,
      documentType: party.documentType,
      documentTypeOtherName: party.documentTypeOtherName,
      maskedDocumentNumber: party.maskedDocumentNumber ?? null,
      validFrom: party.validFrom,
      validTo: party.validTo,
      isPrimaryPayer: party.isPrimaryPayer,
    })),
    depositTerms: contract.depositTerms,
    createdAt: contract.createdAt.toISOString(),
  };
}

export function toContractSummary(contract: RentalContractSummaryRecord): RentalContractSummary {
  return { ...contract, updatedAt: contract.updatedAt.toISOString() };
}
