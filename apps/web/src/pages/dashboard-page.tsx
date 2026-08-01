import { Button } from "@heroui/react/button";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";

import { DashboardDetails } from "../features/dashboard/components/dashboard-details";
import { ModuleTray } from "../features/dashboard/components/module-tray";
import { TrendOverview } from "../features/dashboard/components/trend-overview";
import { WorkspaceShell } from "../features/dashboard/components/workspace-shell";
import { type WebSessionDependency, webSession } from "../services/web-session";
import styles from "./dashboard-page.module.css";

type DashboardPageProps = {
  session?: WebSessionDependency;
};

export function DashboardPage({ session = webSession }: DashboardPageProps = {}) {
  return (
    <WorkspaceShell session={session}>
      <main className={styles.dashboardPage} id="dashboard-main">
        <header className={styles.dashboardHeading}>
          <div className={styles.dashboardTitleGroup}>
            <Button aria-label="返回" className={styles.backButton} isIconOnly>
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1>财务洞察</h1>
              <p>早上好，刘先生</p>
            </div>
          </div>

          <Button className={styles.periodButton}>
            <CalendarBlank size={18} />
            2026年7月
            <CaretDown size={14} />
          </Button>
        </header>

        <ModuleTray />
        <TrendOverview />
        <DashboardDetails />
      </main>
    </WorkspaceShell>
  );
}
