import { CURRENCIES } from "@xpense/shared";
import { createContext, type ReactNode, useContext } from "react";

const CurrencyContext = createContext<string | null>(null);
/** 业务布局提供已认证组织的基础币种，缺失时不推断为人民币。 */
export function OrganizationCurrencyProvider({
  currencyCode,
  children,
}: {
  currencyCode: string | null;
  children: ReactNode;
}) {
  return <CurrencyContext value={currencyCode}>{children}</CurrencyContext>;
}
export function useOrganizationCurrency(): string {
  return useContext(CurrencyContext) ?? "未知币种";
}

/** 单价使用原始 decimal 字符串，保留四位小数等原有精度。 */
export function formatDecimalMoney(value: string, currencyCode: string): string {
  return `${CURRENCIES.find((item) => item.code === currencyCode)?.symbol ?? `${currencyCode} `}${value}`;
}
