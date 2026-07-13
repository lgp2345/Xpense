import { Button } from "@heroui/react/button";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";

import { moduleCards } from "../dashboard-data";

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

  return (
    <div className={`preview-bars preview-bars-${tone}`} aria-hidden="true">
      {heights.map(([key, height]) => (
        <i key={`${tone}-${key}`} style={{ height }} />
      ))}
    </div>
  );
}

export function ModuleTray() {
  return (
    <section className="module-tray" aria-labelledby="module-tray-title">
      <h2 className="sr-only" id="module-tray-title">
        首页模块
      </h2>

      <Button aria-label="添加模块" className="module-add-button" isIconOnly>
        <span>
          <Plus size={22} />
        </span>
      </Button>

      {moduleCards.map((card) => (
        <article className="module-stack" key={card.title}>
          <div className="module-preview" aria-hidden="true">
            <div>
              <small>{card.previewLabel}</small>
              <strong>{card.previewValue}</strong>
            </div>
            <PreviewChart tone={card.tone} />
          </div>
          <div className="module-card">
            <div>
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
            <Button aria-label={`${card.title}更多操作`} className="module-menu-button" isIconOnly>
              <DotsThree size={20} weight="bold" />
            </Button>
          </div>
        </article>
      ))}

      <button className="module-drop-zone" type="button">
        拖入一个模块
      </button>
    </section>
  );
}
