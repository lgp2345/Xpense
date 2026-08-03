import { ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";

import styles from "../../pages/login-page.module.css";

const weeklyBars = [38, 52, 44, 68, 58, 78, 64];

export function LoginShowcase() {
  return (
    <aside aria-label="产品预览" className={styles.showcase}>
      <div className={styles.showcaseSidebar}>
        <div className={styles.showcaseBrand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Wallet size={20} weight="regular" />
          </span>
          <span>Xpense</span>
        </div>

        <div className={styles.showcaseNavigation} aria-hidden="true">
          <span className={styles.showcaseNavActive}>财务洞察</span>
          <span>交易记录</span>
          <span>预算管理</span>
          <span>成员与权限</span>
        </div>

        <p className={styles.showcaseSidebarNote}>个人账本 · 安全工作区</p>
      </div>

      <div className={styles.showcaseCanvas}>
        <div className={styles.showcaseTopbar}>
          <div>
            <p>星期四，8月3日</p>
            <h2>财务洞察</h2>
          </div>
          <span className={styles.showcaseAvatar} aria-hidden="true">
            L
          </span>
        </div>

        <section className={styles.balancePanel} aria-label="账户结余示例">
          <div>
            <p>本月可用结余</p>
            <strong>¥28,560.00</strong>
          </div>
          <span className={styles.balanceTrend}>
            <ChartLineUp size={16} />
            12.8%
          </span>
        </section>

        <section className={styles.chartPanel} aria-label="现金流趋势示例">
          <div className={styles.chartHeading}>
            <div>
              <p>现金流趋势</p>
              <strong>¥8,240</strong>
            </div>
            <DotsThree aria-hidden="true" size={22} />
          </div>
          <div className={styles.chartBars} aria-hidden="true">
            {weeklyBars.map((height) => (
              <span key={height} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className={styles.chartLabels} aria-hidden="true">
            <span>周一</span>
            <span>周二</span>
            <span>周三</span>
            <span>周四</span>
            <span>周五</span>
            <span>周六</span>
            <span>今天</span>
          </div>
        </section>

        <div className={styles.showcaseMetrics}>
          <section>
            <p>本月收入</p>
            <strong>¥12,800</strong>
            <span>较上月 +8.4%</span>
          </section>
          <section>
            <p>预算使用</p>
            <strong>68.7%</strong>
            <span>剩余 ¥3,640</span>
          </section>
        </div>
      </div>
    </aside>
  );
}
