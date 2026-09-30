const decimalPattern = /^(0|[1-9]\d{0,15})(?:\.(\d{1,4}))?$/;
const decimalScale = 10_000n;
const meterChargeDenominator = 100_000_000n;

/** 把 numeric(20,4) 非负十进制字符串放大为 BigInt。 */
export function parseDecimal4(text: string): bigint {
  const match = decimalPattern.exec(text);
  if (!match) throw new RangeError("读数和单价必须是范围内的非负十进制数");
  return BigInt(match[1] as string) * decimalScale + BigInt((match[2] ?? "").padEnd(4, "0") || "0");
}

/** 按十进制定点读数与单价计算水电费，末尾四舍五入到最小货币单位。 */
export function calculateMeterCharge(previous: string, current: string, unitPrice: string): number {
  const usage = parseDecimal4(current) - parseDecimal4(previous);
  if (usage < 0n) throw new RangeError("本次读数不能小于前次读数");
  const numerator = usage * parseDecimal4(unitPrice) * 100n;
  const amount = (numerator * 2n + meterChargeDenominator) / (meterChargeDenominator * 2n);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("水电费超出安全整数范围");
  }
  return Number(amount);
}
