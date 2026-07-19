import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Tooltip } from "@heroui/react/tooltip";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { GearSix } from "@phosphor-icons/react/dist/csr/GearSix";
import { Info } from "@phosphor-icons/react/dist/csr/Info";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { ShareNetwork } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";
import type { PropsWithChildren, ReactNode } from "react";

import { navigationItems } from "../dashboard-data";
import styles from "./workspace-shell.module.css";

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip delay={350}>
      <Button aria-label={label} className={styles.iconButton} isIconOnly>
        {children}
      </Button>
      <Tooltip.Content className={styles.xpenseTooltip}>{label}</Tooltip.Content>
    </Tooltip>
  );
}

function BrandMark() {
  return (
    <div aria-label="Xpense" className={styles.brandLockup} role="img">
      <span className={styles.brandMark} aria-hidden="true">
        <Wallet size={22} weight="duotone" />
      </span>
      <span>Xpense</span>
    </div>
  );
}

function WorkspaceSidebar() {
  return (
    <aside className={styles.workspaceSidebar} aria-label="主要导航">
      <BrandMark />

      <div className={styles.sidebarSectionHeading}>
        <span>页面</span>
        <Button aria-label="添加页面" className={styles.sidebarAddButton} isIconOnly>
          <Plus size={16} />
        </Button>
      </div>

      <nav className={styles.sidebarNavigation}>
        {navigationItems.map(({ badge, icon: ItemIcon, isActive, label }) => (
          <a
            className={`${styles.sidebarNavItem}${isActive ? ` ${styles.active}` : ""}`}
            href={isActive ? "#dashboard-main" : `#${label}`}
            key={label}
          >
            <CaretDown className={styles.sidebarCaret} size={13} />
            <ItemIcon size={19} weight="regular" />
            <span>{label}</span>
            {badge ? <span className={styles.sidebarBadge}>{badge}</span> : null}
          </a>
        ))}
      </nav>

      <div className={styles.sidebarDock}>
        <div aria-label="快捷工具" className={styles.sidebarUtilities} role="toolbar">
          <IconButton label="切换主题">
            <Sun size={18} />
          </IconButton>
          <IconButton label="数据设置">
            <SlidersHorizontal size={18} />
          </IconButton>
          <IconButton label="系统设置">
            <GearSix size={18} />
          </IconButton>
          <IconButton label="帮助信息">
            <Info size={18} />
          </IconButton>
        </div>

        <Button className={styles.quickEntryButton}>
          <Plus size={18} />
          快速记一笔
        </Button>

        <div className={styles.sidebarProfile}>
          <IconButton label="通知">
            <Bell size={18} />
          </IconButton>
          <Avatar className={styles.userAvatar} size="md">
            <Avatar.Fallback className={styles.userAvatarFallback}>刘</Avatar.Fallback>
          </Avatar>
          <div>
            <strong>刘先生</strong>
            <span>个人账户</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceToolbar() {
  return (
    <header className={styles.workspaceToolbar}>
      <nav aria-label="工作区菜单" className={styles.workspaceMenu}>
        <a href="#项目">项目</a>
        <a href="#编辑">编辑</a>
        <a href="#组件">组件</a>
        <a href="#分享">分享</a>
        <a href="#帮助">帮助</a>
      </nav>

      <label className={styles.toolbarSearch}>
        <MagnifyingGlass size={18} />
        <span className="sr-only">搜索财务数据</span>
        <input placeholder="搜索交易、账户或分类" type="search" />
      </label>

      <div className={styles.toolbarActions}>
        <IconButton label="导出">
          <DownloadSimple size={18} />
        </IconButton>
        <IconButton label="分享">
          <ShareNetwork size={18} />
        </IconButton>
      </div>
    </header>
  );
}

export function WorkspaceShell({ children }: PropsWithChildren) {
  return (
    <div className={styles.workspaceShell}>
      <WorkspaceSidebar />
      <div className={styles.workspaceMain}>
        <WorkspaceToolbar />
        {children}
      </div>
    </div>
  );
}
