import { Button } from "@heroui/react/button";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { LockKey } from "@phosphor-icons/react/dist/csr/LockKey";

import styles from "./forbidden-page.module.css";

type ForbiddenPageProps = {
  onBack: () => void;
};

export function ForbiddenPage({ onBack }: ForbiddenPageProps) {
  return (
    <main className={styles.forbiddenShell}>
      <section className={styles.forbiddenPanel} aria-labelledby="forbidden-title">
        <span className={styles.icon} aria-hidden="true">
          <LockKey size={24} />
        </span>
        <h1 id="forbidden-title">无权限访问</h1>
        <p>当前账号缺少查看此页面所需的权限。你可以返回首页，或联系管理员调整角色。</p>
        <Button className={styles.backButton} onPress={onBack}>
          <ArrowLeft size={18} />
          返回首页
        </Button>
      </section>
    </main>
  );
}
