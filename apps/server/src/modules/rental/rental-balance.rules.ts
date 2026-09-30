import type { RentalFinancialState } from "@xpense/shared";
import { parseCalendarDate } from "./contract-date.rules.js";

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

function safeAmount(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name}必须是非负安全整数`);
  return BigInt(value);
}

/** 由应收和有效收退款事实派生余额、状态与逾期标记。 */
export function calculateRentalBalance(
  amountMinor: number,
  receivedMinor: number,
  refundedMinor: number,
  dueDate: string | null,
  today: string,
): {
  receivedMinor: number;
  refundedMinor: number;
  netReceivedMinor: number;
  outstandingMinor: number;
  refundableMinor: number;
  state: RentalFinancialState;
  overdue: boolean;
} {
  const amount = safeAmount(amountMinor, "应收金额");
  const received = safeAmount(receivedMinor, "收款金额");
  const refunded = safeAmount(refundedMinor, "退款金额");
  parseCalendarDate(today);
  if (dueDate !== null) parseCalendarDate(dueDate);

  const net = received - refunded;
  const outstanding = amount > net ? amount - net : 0n;
  const refundable = net > amount ? net - amount : 0n;
  if (net > maximum || net < -maximum || outstanding > maximum || refundable > maximum) {
    throw new RangeError("财务余额超出安全整数范围");
  }

  let state: RentalFinancialState;
  if (refundable > 0n) state = "refundable";
  else if (outstanding === 0n) state = "settled";
  else if (net > 0n) state = "partial";
  else state = "unpaid";

  return {
    receivedMinor,
    refundedMinor,
    netReceivedMinor: Number(net),
    outstandingMinor: Number(outstanding),
    refundableMinor: Number(refundable),
    state,
    overdue: dueDate !== null && dueDate < today && outstanding > 0n,
  };
}
