import { Button } from "@heroui/react/button";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";

import {
  accounts,
  budgetCategories,
  reminders,
  transactions,
  upcomingBills,
} from "../dashboard-data";

function PanelHeader({ action, title }: { action?: string; title: string }) {
  return (
    <header className="detail-panel-header">
      <h2>{title}</h2>
      {action ? (
        <Button className="text-action-button">
          {action}
          <ArrowRight size={15} />
        </Button>
      ) : (
        <Button aria-label={`${title}更多操作`} className="panel-menu-button" isIconOnly>
          <DotsThree size={18} weight="bold" />
        </Button>
      )}
    </header>
  );
}

function BudgetPanel() {
  return (
    <article className="detail-panel budget-panel">
      <PanelHeader title="预算使用" />
      <div className="budget-body">
        <div className="budget-ring" role="img" aria-label="预算已使用68.7%，8240元，共12000元">
          <div>
            <strong>¥8,240</strong>
            <span>已使用 / ¥12,000</span>
          </div>
        </div>
        <div className="budget-category-list">
          {budgetCategories.map(({ icon: CategoryIcon, label, remaining, value }) => (
            <div className="budget-category" key={label}>
              <CategoryIcon size={18} />
              <span>
                <strong>{label}</strong>
                <small>{remaining}</small>
              </span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function TransactionsPanel() {
  return (
    <article className="detail-panel transactions-panel">
      <PanelHeader action="查看全部" title="最近交易" />
      <div className="transaction-list">
        {transactions.map(({ amount, icon: TransactionIcon, meta, name, tone }) => (
          <div className="transaction-row" key={`${name}-${meta}`}>
            <span className="transaction-icon">
              <TransactionIcon size={18} />
            </span>
            <span className="transaction-copy">
              <strong>{name}</strong>
              <small>{meta}</small>
            </span>
            <b className={`transaction-amount is-${tone}`}>{amount}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function AccountsPanel() {
  const maxValue = Math.max(...accounts.map((account) => account.value));

  return (
    <article className="detail-panel accounts-panel">
      <PanelHeader title="账户概览" />
      <div className="accounts-chart" aria-label="账户余额柱状图" role="img">
        {accounts.map((account) => (
          <div className="account-column" key={account.name}>
            <div className="account-bar-track">
              <i style={{ height: `${(account.value / maxValue) * 100}%` }} />
            </div>
            <strong>{account.name}</strong>
            <span>{account.balance}</span>
          </div>
        ))}
      </div>
      <p className="sr-only">招商银行余额18560元，支付宝余额6280元，投资账户余额12340元。</p>
    </article>
  );
}

function RemindersPanel() {
  return (
    <article className="detail-panel reminders-panel">
      <PanelHeader title="智能提醒" />
      <div className="reminder-list">
        {reminders.map(({ detail, icon: ReminderIcon, title }) => (
          <div className="reminder-item" key={title}>
            <ReminderIcon size={19} />
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ArrowRight size={15} />
          </div>
        ))}
      </div>
    </article>
  );
}

function BillsPanel() {
  return (
    <article className="detail-panel bills-panel">
      <PanelHeader action="管理账单" title="即将到期账单" />
      <div className="bill-list">
        {upcomingBills.map(({ amount, date, icon: BillIcon, name }) => (
          <div className="bill-row" key={name}>
            <span className="bill-icon">
              <BillIcon size={19} />
            </span>
            <span>
              <strong>{name}</strong>
              <small>{date}</small>
            </span>
            <b>{amount}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function NetAssetRail() {
  return (
    <aside className="net-asset-rail" aria-label="净资产摘要">
      <span className="net-asset-icon">
        <Wallet size={18} />
      </span>
      <span>
        <small>净资产</small>
        <strong>¥128,460.80</strong>
      </span>
      <span className="net-asset-change">+8.4%</span>
    </aside>
  );
}

export function DashboardDetails() {
  return (
    <section className="dashboard-details" aria-label="预算、交易、账户与账单">
      <NetAssetRail />
      <BudgetPanel />
      <TransactionsPanel />
      <AccountsPanel />
      <div className="insights-column">
        <RemindersPanel />
        <BillsPanel />
      </div>
    </section>
  );
}
