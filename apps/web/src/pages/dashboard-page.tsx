import { Button } from "@heroui/react/button";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";

import { DashboardDetails } from "../features/dashboard/components/dashboard-details";
import { ModuleTray } from "../features/dashboard/components/module-tray";
import { TrendOverview } from "../features/dashboard/components/trend-overview";
import { WorkspaceShell } from "../features/dashboard/components/workspace-shell";
import "../features/dashboard/styles/dashboard-layout.css";
import "../features/dashboard/styles/dashboard-components.css";
import "../features/dashboard/styles/dashboard-details.css";
import "../features/dashboard/styles/dashboard-responsive.css";

export function DashboardPage() {
  return (
    <WorkspaceShell>
      <main className="dashboard-page" id="dashboard-main">
        <header className="dashboard-heading">
          <div className="dashboard-title-group">
            <Button aria-label="返回" className="back-button" isIconOnly>
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1>财务洞察</h1>
              <p>早上好，刘先生</p>
            </div>
          </div>

          <Button className="period-button">
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
