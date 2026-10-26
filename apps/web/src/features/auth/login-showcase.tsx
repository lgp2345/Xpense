import styles from "./login-showcase.module.css";

export function LoginShowcase() {
  return (
    <aside aria-label="产品预览" className={styles.showcase}>
      <div className={styles.heroCopy}>
        <h1 className={styles.headline}>
          <span>
            <span>收支与租务，</span>
          </span>
          <span>
            <span className={styles.accent}>一处掌握。</span>
          </span>
        </h1>
        <p className={styles.description}>
          记好每笔收支，管好每份租约。
          <br />
          从日常账目到房源合同，让管理更有条理。
        </p>
      </div>
      <div className={styles.heroVisual}>
        <img
          className={styles.heroImage}
          src="/images/login-home-ledger.webp"
          alt="钥匙与房屋主题插画，展示租赁管理场景"
          width={1536}
          height={1024}
          fetchPriority="high"
        />
      </div>
    </aside>
  );
}
