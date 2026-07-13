import type { Icon } from "@phosphor-icons/react";
import { Bank } from "@phosphor-icons/react/dist/csr/Bank";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { ChartPieSlice } from "@phosphor-icons/react/dist/csr/ChartPieSlice";
import { ClockCountdown } from "@phosphor-icons/react/dist/csr/ClockCountdown";
import { CreditCard } from "@phosphor-icons/react/dist/csr/CreditCard";
import { ForkKnife } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Receipt } from "@phosphor-icons/react/dist/csr/Receipt";
import { ShoppingBag } from "@phosphor-icons/react/dist/csr/ShoppingBag";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { TrendUp } from "@phosphor-icons/react/dist/csr/TrendUp";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";

export type NavigationItem = {
  label: string;
  icon: Icon;
  badge?: string;
  isActive?: boolean;
};

export type Transaction = {
  name: string;
  meta: string;
  amount: string;
  tone: "income" | "expense";
  icon: Icon;
};

export type Account = {
  name: string;
  type: string;
  balance: string;
  value: number;
};

export const navigationItems: NavigationItem[] = [
  { label: "财务洞察", icon: ChartLineUp, isActive: true },
  { label: "交易记录", icon: Receipt, badge: "2" },
  { label: "账户", icon: Wallet },
  { label: "预算管理", icon: ChartPieSlice },
  { label: "统计分析", icon: TrendUp, badge: "15+" },
  { label: "周期账单", icon: ClockCountdown, badge: "3" },
];

export const moduleCards = [
  {
    title: "财务总览",
    subtitle: "本月概览",
    previewLabel: "结余",
    previewValue: "¥28,560.00",
    tone: "violet",
  },
  {
    title: "预算使用",
    subtitle: "本月预算",
    previewLabel: "预算趋势",
    previewValue: "68.7%",
    tone: "violet",
  },
  {
    title: "即将到期账单",
    subtitle: "未来 7 天",
    previewLabel: "待处理账单",
    previewValue: "2 项",
    tone: "coral",
  },
] as const;

export const transactions: Transaction[] = [
  {
    name: "盒马鲜生",
    meta: "餐饮 / 今天 11:23",
    amount: "-¥268.50",
    tone: "expense",
    icon: ForkKnife,
  },
  {
    name: "工资入账",
    meta: "收入 / 7月22日 09:00",
    amount: "+¥12,800",
    tone: "income",
    icon: Bank,
  },
  {
    name: "滴滴出行",
    meta: "交通 / 7月21日 18:45",
    amount: "-¥46.00",
    tone: "expense",
    icon: CreditCard,
  },
  {
    name: "Netflix",
    meta: "订阅 / 7月20日 23:59",
    amount: "-¥68.00",
    tone: "expense",
    icon: Receipt,
  },
];

export const accounts: Account[] = [
  { name: "招商银行", type: "储蓄卡", balance: "¥18,560", value: 18_560 },
  { name: "支付宝", type: "电子钱包", balance: "¥6,280", value: 6_280 },
  { name: "投资账户", type: "基金与股票", balance: "¥12,340", value: 12_340 },
];

export const reminders = [
  {
    title: "餐饮预算已使用 82%",
    detail: "本月剩余 ¥360",
    icon: Sparkle,
  },
  {
    title: "订阅支出较上月增加 ¥96",
    detail: "建议检查续费项目",
    icon: Bell,
  },
] as const;

export const upcomingBills = [
  { name: "房租", date: "7月15日", amount: "¥4,500", icon: House },
  { name: "信用卡还款", date: "7月18日", amount: "¥3,286.40", icon: CreditCard },
] as const;

export const budgetCategories = [
  { label: "餐饮", value: "82%", remaining: "剩余 ¥360", icon: ForkKnife },
  { label: "购物", value: "71%", remaining: "剩余 ¥580", icon: ShoppingBag },
  { label: "住房", value: "54%", remaining: "剩余 ¥2,300", icon: House },
] as const;
