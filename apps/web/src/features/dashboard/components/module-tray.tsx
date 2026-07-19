import { Button } from "@heroui/react/button";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";

import { moduleCards } from "../dashboard-data";
import styles from "./module-tray.module.css";

function PreviewChart({ tone }: { tone: "violet" | "coral" }) {
  const heights =
    tone === "coral"
      ? [
          ["a", 22],
          ["b", 31],
          ["c", 28],
          ["d", 45],
          ["e", 38],
          ["f", 52],
        ]
      : [
          ["a", 16],
          ["b", 28],
          ["c", 24],
          ["d", 34],
          ["e", 23],
          ["f", 39],
        ];

  const toneClass = tone === "coral" ? styles.previewBarsCoral : styles.previewBarsViolet;

  return (
    <div className={`${styles.previewBars} ${toneClass}`} aria-hidden="true">
      {heights.map(([key, height]) => (
        <i key={`${tone}-${key}`} style={{ height }} />
      ))}
    </div>
  );
}

export function ModuleTray() {
  return (
    <section className={styles.moduleTray} aria-labelledby="module-tray-title">
      <h2 className="sr-only" id="module-tray-title">
        首页模块
      </h2>

      <Button aria-label="添加模块" className={styles.moduleAddButton} isIconOnly>
        <span>
          <Plus size={22} />
        </span>
      </Button>

      {moduleCards.map((card) => (
        <article className={styles.moduleStack} key={card.title}>
          <div className={styles.modulePreview} aria-hidden="true">
            <div>
              <small>{card.previewLabel}</small>
              <strong>{card.previewValue}</strong>
            </div>
            <PreviewChart tone={card.tone} />
          </div>
          <div className={styles.moduleCard}>
            <div>
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
            <Button
              aria-label={`${card.title}更多操作`}
              className={styles.moduleMenuButton}
              isIconOnly
            >
              <DotsThree size={20} weight="bold" />
            </Button>
          </div>
        </article>
      ))}

      <button className={styles.moduleDropZone} type="button">
        拖入一个模块
      </button>
    </section>
  );
}
