import { Button } from "@heroui/react/button";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { X } from "@phosphor-icons/react/dist/csr/X";

const incomePoints = [
  [52, 82],
  [172, 55],
  [292, 69],
  [412, 42],
  [532, 73],
  [652, 45],
  [772, 61],
  [848, 94],
] as const;

const expensePoints = [
  [52, 150],
  [172, 133],
  [292, 141],
  [412, 122],
  [532, 163],
  [652, 149],
  [772, 138],
  [848, 168],
] as const;

function pointsToString(points: ReadonlyArray<readonly [number, number]>) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

const hatchPoints = pointsToString([...incomePoints, ...[...expensePoints].reverse()]);

const filters = ["账户", "分类", "时间范围", "收支类型"];

function FinancialSummary() {
  return (
    <section className="financial-summary" aria-labelledby="financial-summary-title">
      <div>
        <p className="section-label" id="financial-summary-title">
          本月财务总览
        </p>
        <p className="primary-balance">
          <span>¥</span>40,439.00
        </p>
      </div>

      <dl className="summary-metrics">
        <div>
          <dt>本月收入</dt>
          <dd>¥18,320</dd>
        </div>
        <div>
          <dt>本月支出</dt>
          <dd>¥12,640</dd>
        </div>
        <div>
          <dt>本月结余</dt>
          <dd>¥5,680</dd>
        </div>
        <div>
          <dt>储蓄率</dt>
          <dd>31.0%</dd>
        </div>
      </dl>
    </section>
  );
}

function TrendChart() {
  return (
    <section className="trend-section" aria-labelledby="trend-chart-title">
      <div className="trend-toolbar">
        <div>
          <h2 id="trend-chart-title">收支趋势</h2>
          <p>7月17日 - 7月23日</p>
        </div>
        <fieldset aria-label="趋势筛选" className="trend-filters">
          {filters.map((filter) => (
            <Button className="filter-button" key={filter}>
              {filter}
              <CaretDown size={14} />
            </Button>
          ))}
        </fieldset>
      </div>

      <div className="trend-chart-wrap">
        <svg
          aria-describedby="trend-chart-description"
          aria-labelledby="trend-chart-svg-title"
          className="trend-chart"
          role="img"
          viewBox="0 0 900 220"
        >
          <title id="trend-chart-svg-title">7月17日至23日收支趋势图</title>
          <defs>
            <pattern height="10" id="diagonalHatch" patternUnits="userSpaceOnUse" width="10">
              <path className="chart-hatch-line" d="M-2 2 L2 -2 M0 10 L10 0 M8 12 L12 8" />
            </pattern>
          </defs>

          {[30, 75, 120, 165].map((y) => (
            <line className="chart-grid-line" key={y} x1="42" x2="860" y1={y} y2={y} />
          ))}
          {[52, 172, 292, 412, 532, 652, 772, 848].map((x) => (
            <line
              className="chart-grid-line chart-grid-vertical"
              key={x}
              x1={x}
              x2={x}
              y1="22"
              y2="176"
            />
          ))}

          <polygon className="chart-hatch-area" points={hatchPoints} />
          <polyline
            className="chart-line chart-line-income"
            points={pointsToString(incomePoints)}
          />
          <polyline
            className="chart-line chart-line-expense"
            points={pointsToString(expensePoints)}
          />

          {incomePoints.map(([x, y]) => (
            <circle
              className="chart-node chart-node-income"
              cx={x}
              cy={y}
              key={`income-${x}`}
              r="4"
            />
          ))}
          {expensePoints.map(([x, y]) => (
            <circle
              className="chart-node chart-node-expense"
              cx={x}
              cy={y}
              key={`expense-${x}`}
              r="3.5"
            />
          ))}

          {[
            [52, "7月17日"],
            [172, "7月18日"],
            [292, "7月19日"],
            [412, "7月20日"],
            [532, "7月21日"],
            [652, "7月22日"],
            [772, "7月23日"],
          ].map(([x, label]) => (
            <text className="chart-axis-label" key={label} textAnchor="middle" x={x} y="207">
              {label}
            </text>
          ))}
        </svg>

        <div className="chart-tooltip" role="note">
          <Button aria-label="关闭数据提示" className="chart-tooltip-close" isIconOnly>
            <X size={14} />
          </Button>
          <strong>+24%</strong>
          <span>本月结余增长</span>
        </div>
      </div>

      <p className="sr-only" id="trend-chart-description">
        7月17日至23日收入整体高于支出，7月20日与7月22日收入出现阶段性高点，本月结余增长24%。
      </p>
    </section>
  );
}

export function TrendOverview() {
  return (
    <section className="analysis-canvas" aria-label="财务总览与收支趋势">
      <FinancialSummary />
      <TrendChart />
    </section>
  );
}
